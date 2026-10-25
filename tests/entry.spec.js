const { test, expect } = require('playwright/test');
test.use({ reducedMotion: 'reduce', isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });
const image = page => page.locator('canvas').evaluate(c => c.toDataURL());
const ready = page => page.waitForFunction(() => window.inkTideDiagnostics?.ready());
const quiet = page => page.waitForFunction(() => !inkTideDiagnostics.pending());
async function expectDrop(page) {
  await expect(page.locator('#drop')).toHaveAttribute('aria-pressed', 'true');
  for (const id of ['comb', 'round', 'fan']) await expect(page.locator('#' + id)).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => inkTideDiagnostics.surface().tool)).toBe('drop');
}
async function saved(page, study) {
  await page.waitForFunction(async study => {
    const value = await new Promise(resolve => {
      const request = indexedDB.open('ink-tide-bath-v3', 1);
      request.onsuccess = () => {
        const db = request.result, read = db.transaction('paper').objectStore('paper').get('latest');
        read.onsuccess = () => { db.close(); resolve(read.result); };
      };
    });
    return value?.study === study;
  }, study);
}
test('Drop is selected in the HTML before scripts run', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); await page.goto(baseURL);
  await expect(page.locator('#drop')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#comb')).toHaveAttribute('aria-pressed', 'false');
  await context.close();
});
test('fresh mobile storage starts with Drop and the first tap deposits pigment', async ({ page }) => {
  await page.goto('./'); await ready(page); await expectDrop(page); const blank = await image(page);
  await page.touchscreen.tap(190, 300); await quiet(page);
  expect(await image(page)).not.toBe(blank); await expectDrop(page);
});
test('Fresh paper and a reload of persisted blank paper select Drop', async ({ page }) => {
  await page.goto('./'); await ready(page); await page.locator('#comb').tap();
  await expect(page.locator('#comb')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#new').tap(); await expectDrop(page); const blank = await image(page);
  await saved(page, 2);
  await page.locator('#comb').tap(); await page.reload(); await ready(page); await expectDrop(page);
  expect(await image(page)).toBe(blank);
  await page.setViewportSize({ width: 1440, height: 950 });
  const r = await page.locator('canvas').boundingBox(); await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await expect(page.locator('#tool-cursor')).toHaveAttribute('data-tool', 'drop');
});
test('cached blank entry selects Drop but active and saved artwork is preserved', async ({ page }) => {
  await page.goto('./'); await ready(page); await page.locator('#comb').tap();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false })));
  await expect(page.locator('#comb')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expectDrop(page);
  await page.touchscreen.tap(190, 300); await quiet(page); const artwork = await image(page); await saved(page, 1);
  await page.locator('#comb').tap();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.locator('#comb')).toHaveAttribute('aria-pressed', 'true'); expect(await image(page)).toBe(artwork);
  await page.reload(); await ready(page); expect(await image(page)).toBe(artwork);
});
for (const tool of ['comb', 'round']) {
  test('late storage restore preserves an explicit ' + tool + ' choice', async ({ page }) => {
    await page.goto('./'); await ready(page); await page.touchscreen.tap(190, 300); await quiet(page);
    const artwork = await image(page); await saved(page, 1);
    await page.addInitScript(() => {
      const open = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (...args) {
        const request = open.apply(this, args);
        Object.defineProperty(request, 'onsuccess', { configurable: true, set(handler) {
          request.addEventListener('success', event => { window.resumeStoredPaper = () => handler.call(request, event); });
        } });
        return request;
      };
    });
    await page.reload(); await page.waitForFunction(() => typeof window.resumeStoredPaper === 'function');
    await page.locator('#' + tool).tap(); await page.evaluate(() => window.resumeStoredPaper()); await ready(page);
    await expect(page.locator('#' + tool)).toHaveAttribute('aria-pressed', 'true'); expect(await image(page)).toBe(artwork);
    if (tool === 'round') await expect(page.locator('#brush-state')).toHaveText('Clean');
  });
}
