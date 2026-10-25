const { test, expect } = require('playwright/test');
const { createHash } = require('crypto');
const quiet = page => page.waitForFunction(() => !inkTideDiagnostics.pending());
const image = async page => createHash('sha256').update(await page.locator('canvas').evaluate(c => c.toDataURL())).digest('hex');

for (const name of ['comb', 'round-clean', 'round-loaded', 'fan-clean', 'fan-loaded']) {
  test(`${name}: bounded catch-up retains paced artwork and whole-stroke undo`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('./'); await page.waitForFunction(() => inkTideDiagnostics.ready());
    const r = await page.locator('canvas').boundingBox();
    await page.locator('.well[data-pigment="19"]').click();
    await page.mouse.click(r.x + r.width * .24, r.y + r.height * .5); await quiet(page);
    const [tool, state] = name.split('-'); await page.locator('#' + tool).click();
    if (state === 'loaded') await page.locator('.well[data-pigment="6"]').click();
    if (state === 'clean') await page.locator('#rinse').click();
    const baseline = await image(page);
    await page.evaluate(() => {
      window.batches = []; window.stepsInBatch = 0;
      const step = InkBath.prototype.step, resolve = InkBath.prototype.resolveStroke;
      InkBath.prototype.step = function (...args) { stepsInBatch++; return step.apply(this, args); };
      InkBath.prototype.resolveStroke = function (...args) {
        batches.push(stepsInBatch); stepsInBatch = 0; return resolve.apply(this, args);
      };
    });
    async function draw(paced, jump = false) {
      await page.mouse.move(r.x + r.width * .16, r.y + r.height * .5); await page.mouse.down();
      const count = jump ? 1 : 10, moves = [];
      for (let i = 1; i <= count; i++) {
        const move = page.mouse.move(r.x + r.width * (.16 + .16 * i / count), r.y + r.height * .5);
        if (paced) await move; else moves.push(move);
        if (paced) await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      }
      await Promise.all(moves); await page.mouse.up(); await quiet(page);
    }
    await draw(false, true); const batches = await page.evaluate(() => window.batches);
    expect(Math.max(...batches)).toBeLessThanOrEqual(32);
    expect(batches.length).toBeLessThanOrEqual(4);
    await page.locator('#undo').click(); expect(await image(page)).toBe(baseline);
    await draw(false); const fast = await image(page);
    await page.locator('#undo').click(); expect(await image(page)).toBe(baseline);
    await draw(true); expect(await image(page)).toBe(fast);
    await page.locator('#undo').click(); expect(await image(page)).toBe(baseline);
  });
}
