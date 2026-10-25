const { test, expect } = require('playwright/test');
const quiet = page => page.waitForFunction(() => !inkTideDiagnostics.pending());
const image = page => page.locator('canvas').evaluate(c => c.toDataURL());
async function pigment(page, tool, index) {
  await page.locator('#' + tool).click();
  if (await page.locator('#palette-toggle').isVisible()) await page.locator('#palette-toggle').click();
  await page.locator('.well[data-pigment="' + index + '"]').click();
}
async function draw(page) {
  const r = await page.locator('canvas').boundingBox();
  await page.mouse.move(r.x + r.width * .25, r.y + r.height * .45);
  await page.mouse.down();
  for (let i = 1; i <= 24; i++) {
    const t = i / 24;
    await page.mouse.move(r.x + r.width * (.25 + .5 * t), r.y + r.height * (.45 + .10 * Math.sin(t * Math.PI * 1.5)));
    await page.waitForTimeout(12);
  }
  await page.mouse.up(); await quiet(page);
}
async function open(page) {
  await page.goto('./'); await page.waitForFunction(() => window.inkTideDiagnostics);
}
test('blank entry, spreading drops, curved comb and exact undo/export', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message)); await open(page);
  const blank = await image(page);
  const range = await page.locator('canvas').evaluate(c => {
    const copy = new OffscreenCanvas(c.width, c.height), x = copy.getContext('2d'); x.drawImage(c, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data; let low = 255, high = 0;
    for (let i = 0; i < d.length; i += 160) { low = Math.min(low, d[i]); high = Math.max(high, d[i]); }
    return high - low;
  }); expect(range).toBeLessThan(12);
  await pigment(page, 'drop', 19); await page.touchscreen.tap(190, 300);
  await page.waitForTimeout(240); expect(await page.evaluate(() => inkTideDiagnostics.surface().waves.length)).toBeGreaterThan(0);
  await quiet(page); const dropped = await image(page); expect(dropped).not.toBe(blank);
  await pigment(page, 'drop', 6); await page.touchscreen.tap(205, 305); await quiet(page);
  const before = await image(page); await page.locator('#comb').click(); await draw(page);
  expect(await image(page)).not.toBe(before); await page.locator('#undo').click(); expect(await image(page)).toBe(before);
  const download = page.waitForEvent('download'); await page.locator('#save').click(); const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.png$/); expect(require('fs').statSync(await file.path()).size).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});
test('brushes dip, retain colour, rinse, move and undo a complete stroke', async ({ page }) => {
  await open(page); await pigment(page, 'drop', 19); await page.touchscreen.tap(190, 300); await quiet(page);
  const baseline = await image(page);
  for (const tool of ['round', 'fan']) {
    await pigment(page, tool, 6); await expect(page.locator('#' + tool)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#brush-state')).toHaveText('Coral'); await draw(page);
    expect(await image(page)).not.toBe(baseline); await page.locator('#undo').click(); expect(await image(page)).toBe(baseline);
    await page.locator('#rinse').click(); await expect(page.locator('#brush-state')).toHaveText('Clean'); await draw(page);
    expect(await image(page)).not.toBe(baseline); await page.locator('#undo').click(); expect(await image(page)).toBe(baseline);
  }
});
test('36 pigments, comfortable small-screen targets and aligned bath-only cursors', async ({ page }) => {
  await open(page); await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const id of ['drop', 'comb', 'round', 'fan']) {
    const r = await page.locator('#' + id).boundingBox(); expect(r.width).toBeGreaterThanOrEqual(44); expect(r.height).toBeGreaterThanOrEqual(44);
  }
  await page.locator('#palette-toggle').click(); await expect(page.locator('.well')).toHaveCount(36);
  const well = await page.locator('.well').first().boundingBox(); expect(well.width).toBeGreaterThanOrEqual(44); expect(well.height).toBeGreaterThanOrEqual(44);
  await page.locator('#close-palette').click(); await page.setViewportSize({ width: 1440, height: 950 });
  for (const id of ['drop', 'comb', 'round', 'fan']) {
    await page.locator('#' + id).click(); const r = await page.locator('canvas').boundingBox(), p = { x: r.x + r.width * .6, y: r.y + r.height * .6 };
    await page.mouse.move(p.x, p.y); await expect(page.locator('#tool-cursor')).toBeVisible();
    const error = await page.locator('#tool-cursor circle').evaluate((c, p) => { const r = c.getBoundingClientRect(); return Math.hypot(r.x + r.width / 2 - p.x, r.y + r.height / 2 - p.y); }, p);
    expect(error).toBeLessThan(.5); await page.mouse.move(10, 10); await expect(page.locator('#tool-cursor')).toBeHidden();
  }
});
