const { test, expect } = require('playwright/test');
const fs = require('fs');

async function open(page) {
  await page.addInitScript(() => {
    let constructor;
    Object.defineProperty(window, 'InkBath', {
      get: () => constructor,
      set(value) {
        constructor = new Proxy(value, { construct(Target, args) {
          const bath = Reflect.construct(Target, args), display = bath.display;
          window.waterTest = { bath, paint: (...args) => display.apply(bath, args), last: null };
          bath.display = function (...args) { waterTest.last = args; return display.apply(this, args); };
          return bath;
        } });
      }
    });
    window.waterPixels = () => {
      const c = document.querySelector('canvas'), r = c.getBoundingClientRect();
      const copy = new OffscreenCanvas(Math.round(r.width), Math.round(r.height)), x = copy.getContext('2d');
      x.drawImage(c, 0, 0, copy.width, copy.height); return x.getImageData(0, 0, copy.width, copy.height).data;
    };
    window.waterDifference = (a, b) => {
      let max = 0, visible = 0, light = 0, dark = 0;
      for (let i = 0; i < a.length; i += 4) {
        const delta = a[i] - b[i]; max = Math.max(max, Math.abs(delta));
        if (Math.abs(delta) >= 3) visible++;
        if (delta > 0) light++; if (delta < 0) dark++;
      }
      return { max, visible, light, dark };
    };
  });
  await page.goto('./'); await page.waitForFunction(() => window.inkTideDiagnostics?.ready());
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`water remains visible in every direction at ${viewport.width}px and never writes pigment`, async ({ page }) => {
    await page.setViewportSize(viewport); await open(page);
    const result = await page.evaluate(async () => {
      const { bath, paint } = waterTest, portrait = innerWidth <= 740;
      async function inkHash() {
        bath.cache = null;
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bath.read()))).join(',');
      }
      const before = await inkHash(); paint(portrait, [], []); const blank = waterPixels(), cases = [];
      for (const [kind, width, strength] of [[0, 11, .018], [1, 10, .023], [2, 26, .015]]) {
        for (const [x, y] of [[1, 0], [0, 1], [.6, .8], [-.6, -.8]]) {
          const wake = [750 - 220 * x, 550 - 220 * y, 750 + 220 * x, 550 + 220 * y, .08, width, kind, strength];
          paint(portrait, [], [wake]); cases.push(waterDifference(waterPixels(), blank));
        }
      }
      paint(portrait, [], [[530, 550, 970, 550, .56, 11, 0, .018]]);
      const expired = waterDifference(waterPixels(), blank), after = await inkHash();
      const impact = [[750, 550, .3, 5]];
      paint(portrait, impact, []); const drop = waterPixels();
      paint(portrait, impact, [[530, 550, 970, 550, .56, 11, 0, .018]]);
      const expiredWithDrop = waterDifference(waterPixels(), drop); paint(portrait, [], []);
      return { cases, expired, before, after, expiredWithDrop };
    });
    for (const value of result.cases) {
      expect(value.max).toBeGreaterThanOrEqual(4); expect(value.visible).toBeGreaterThan(20);
      expect(value.light).toBeGreaterThan(0); expect(value.dark).toBeGreaterThan(0);
    }
    expect(result.expired.max).toBe(0); expect(result.expiredWithDrop.max).toBe(0);
    expect(result.after).toBe(result.before);
  });
}

test('native diagonal tool wakes are visible on phone, and export/undo clear the temporary surface', async ({ page }) => {
  await open(page); const blank = await page.locator('canvas').evaluate(c => c.toDataURL());
  const cdp = await page.context().newCDPSession(page);
  for (const tool of ['comb', 'round', 'fan']) {
    await page.locator('#' + tool).click();
    const r = await page.locator('canvas').boundingBox();
    const point = (x, y) => ({ x: r.x + (1 - y / 1100) * r.width, y: r.y + x / 1500 * r.height });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(650, 450)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(722, 546)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() => waterTest.last?.[2]?.some(w => w[4] >= 0));
    const visibility = await page.evaluate(() => {
      const { paint, last } = waterTest, actual = waterPixels();
      paint(last[0], last[1], []); const quiet = waterPixels(); paint(...last);
      return waterDifference(actual, quiet);
    });
    expect(visibility.max).toBeGreaterThanOrEqual(4);
    const download = page.waitForEvent('download'); await page.locator('#save').click();
    const saved = 'data:image/png;base64,' + fs.readFileSync(await (await download).path()).toString('base64');
    const identicalPixels = await page.evaluate(async ([a, b]) => {
      async function decode(data) {
        const image = await createImageBitmap(await (await fetch(data)).blob());
        const copy = new OffscreenCanvas(image.width, image.height), x = copy.getContext('2d');
        x.drawImage(image, 0, 0); return x.getImageData(0, 0, image.width, image.height).data;
      }
      const [left, right] = await Promise.all([decode(a), decode(b)]);
      return left.length === right.length && left.every((value, i) => value === right[i]);
    }, [saved, blank]);
    expect(identicalPixels).toBe(true);
    expect(await page.evaluate(() => inkTideDiagnostics.surface().wakes)).toBe(0);
    await page.locator('#undo').click(); expect(await page.locator('canvas').evaluate(c => c.toDataURL())).toBe(blank);
  }
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`instrument crests travel away from contact before settling at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport); await open(page);
    const profiles = await page.evaluate(() => {
      const { bath, paint } = waterTest, portrait = innerWidth <= 740, c = bath.canvas;
      const copy = new OffscreenCanvas(c.width, c.height), ctx = copy.getContext('2d');
      const pixels = () => { ctx.drawImage(c, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data; };
      paint(portrait, [], []); const blank = pixels();
      const results = [];
      for (const [kind, width, strength] of [[0, 11, .018], [1, 10, .023], [2, 26, .015]]) {
        const peaks = [];
        for (const age of [.1, .3]) {
          paint(portrait, [], [[530, 550, 970, 550, age, width, kind, strength]]); const current = pixels();
          let peak = 0, energy = 0;
          for (let r = 15; r < 170; r++) {
            let value = 0;
            for (let x = 720; x <= 780; x += 3) {
              const y = 550 + (kind === 0 ? 234 : kind === 2 ? 20 : 0) + r;
              const px = portrait ? 1100 - y : x, py = portrait ? x : y, index = (py * c.width + px) * 4;
              value += Math.abs(current[index] - blank[index]);
            }
            if (value > energy) { energy = value; peak = r; }
          }
          peaks.push({ age, peak, energy });
        }
        paint(portrait, [], [[530, 550, 970, 550, .551, width, kind, strength]]);
        results.push({ kind, peaks, settled: pixels().every((v, i) => v === blank[i]) });
      }
      paint(portrait, [], []); return results;
    });
    for (const result of profiles) {
      expect(result.peaks[0].energy).toBeGreaterThan(30);
      expect(result.peaks[1].energy).toBeGreaterThan(30);
      expect(result.peaks[1].peak - result.peaks[0].peak).toBeGreaterThan(45);
      expect(result.peaks[1].peak - result.peaks[0].peak).toBeLessThan(110);
      expect(result.settled).toBe(true);
    }
  });
}

test('held release retains movement age instead of making a new water impulse', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 }); await open(page);
  await page.locator('#round').click();
  await page.evaluate(() => {
    window.releaseSamples = [];
    const display = waterTest.bath.display;
    waterTest.bath.display = function (...args) { releaseSamples.push({ time: performance.now(), wakes: args[2] }); return display.apply(this, args); };
  });
  const r = await page.locator('canvas').boundingBox(), y = r.y + r.height / 2;
  await page.mouse.move(r.x + r.width * 400 / 1500, y); await page.mouse.down();
  await page.mouse.move(r.x + r.width * 1100 / 1500, y, { steps: 20 });
  await page.waitForTimeout(200);
  const released = await page.evaluate(() => performance.now()); await page.mouse.up();
  await page.waitForTimeout(80);
  const result = await page.evaluate(released => releaseSamples.filter(s => s.time >= released).flatMap(s => s.wakes), released);
  expect(result.length).toBeGreaterThan(0);
  expect(result.every(w => w[4] > .15)).toBe(true);
  expect(result.every(w => w[8] >= w[4])).toBe(true);
});

test('water packet pressure fades before reclaiming a slot and never queues excess emissions', async ({ page }) => {
  const source = fs.readFileSync(require('path').join(__dirname, '../app.js'), 'utf8');
  await page.route('**/app.js*', route => route.fulfill({ contentType: 'text/javascript', body: source.replace(
    '  function addWake(g,from,to,start,end){',
    '  window.waterBudget={emit:addWake,fade:wakeFade,packets:()=>wakes};\n  function addWake(g,from,to,start,end){'
  ) }));
  await open(page);
  const result = await page.evaluate(() => {
    const realNow = performance.now.bind(performance), g = { tool: 'round' }; let now = 1000;
    performance.now = () => now;
    try {
      for (let i = 0; i < 14; i++) {
        now = 1000 + i * 2;
        waterBudget.emit(g, [i * 100, 500], [i * 100 + 3, 500], now - 1, now);
      }
      const full = waterBudget.packets().map(w => ({ ...w })), oldest = full[0];
      const initial = waterBudget.fade(oldest, oldest.retiring - 10);
      const halfway = waterBudget.fade(oldest, oldest.retiring + 30);
      const faded = waterBudget.fade(oldest, oldest.retiring + 60);
      now = 1100; waterBudget.emit(g, [2000, 500], [2003, 500], now - 1, now);
      return { count: full.length, skipped: full.every(w => w.line[0] < 1200), initial, halfway, faded,
        reclaimed: !waterBudget.packets().some(w => w.line[0] === oldest.line[0]),
        latest: waterBudget.packets().at(-1).line[0], finalCount: waterBudget.packets().length };
    } finally { performance.now = realNow; }
  });
  expect(result).toEqual({ count: 12, skipped: true, initial: 1, halfway: .5, faded: 0, reclaimed: true, latest: 2000, finalCount: 12 });
});
