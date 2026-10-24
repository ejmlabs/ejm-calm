import assert from 'node:assert/strict';
import { withBrowser, openFlight, DESKTOP, MOBILE } from './browser.mjs';

async function pixels(page) {
  const snapshot = (await page.locator('#space').screenshot()).toString('base64');
  return page.locator('#space').evaluate(async (canvas, encoded) => {
    const image = new Image(); image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const copy = document.createElement('canvas'); copy.width = 96; copy.height = 64;
    const context = copy.getContext('2d'); context.drawImage(image, 0, 0, copy.width, copy.height);
    const data = context.getImageData(0, 0, copy.width, copy.height).data;
    let min = 765, max = 0, nonBlack = 0;
    for (let i = 0; i < data.length; i += 4) {
      const value = data[i] + data[i + 1] + data[i + 2];
      min = Math.min(min, value); max = Math.max(max, value); if (value > 9) nonBlack++;
    }
    return { min, max, nonBlack, width: canvas.width, height: canvas.height };
  }, snapshot);
}

await withBrowser(async (browser, base) => {
  for (const device of [DESKTOP, MOBILE]) {
    const { page, context, errors, external } = await openFlight(browser, base, device);
    try {
      assert.equal(new URL(page.url()).searchParams.get('seed'), '42');
      assert.equal(await page.locator('body').getAttribute('data-started'), null);
      await page.getByRole('button', { name: /^begin$/i }).click();
      await page.waitForTimeout(1800);
      assert.equal(await page.locator('body').getAttribute('data-started'), 'true');
      const picture = await pixels(page);
      assert.ok(picture.nonBlack > 500 && picture.max - picture.min > 25, `Canvas must contain a rendered scene: ${JSON.stringify(picture)}`);
      if (device.name === 'mobile') assert.ok(picture.width <= 390 * 1.25 + 1, 'Mobile DPR is capped');
      await page.getByRole('button', { name: 'Pause flight', exact: true }).click();
      assert.equal(await page.locator('body').getAttribute('data-paused'), 'true');
      const first = await page.evaluate(() => JSON.parse(localStorage.getItem('ejm-fly:v1')));
      await page.waitForTimeout(450);
      await page.locator('#space').focus(); await page.keyboard.press('Space');
      assert.equal(await page.locator('body').getAttribute('data-paused'), 'false');
      await page.waitForTimeout(400);
      await page.keyboard.press('Space');
      const second = await page.evaluate(() => JSON.parse(localStorage.getItem('ejm-fly:v1')));
      assert.ok(second.flight.time > first.flight.time, 'Flight resumes after pause');
      assert.equal(second.sound.volume, 0.5);
      const position = second.flight.position;
      await page.goto(`${base}/`, { waitUntil: 'networkidle' });
      await page.waitForSelector('body[data-ready="true"]');
      await page.getByRole('button', { name: /^begin$/i }).click();
      await page.getByRole('button', { name: 'Pause flight', exact: true }).click();
      const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('ejm-fly:v1')));
      assert.ok(Math.hypot(...restored.flight.position.map((n, i) => n - position[i])) < 10, 'A URL without a seed resumes the saved flight');
      assert.deepEqual(errors, []); assert.deepEqual(external, []);
      console.log(`${device.name}: render, Begin, pause, resume, persistence, and local requests passed`);
    } finally { await context.close(); }
  }
  const { page, context, errors } = await openFlight(browser, base, DESKTOP, { reducedMotion: 'reduce', seed: 0 });
  try {
    await page.getByRole('button', { name: /^begin$/i }).click();
    assert.equal(await page.locator('body').getAttribute('data-paused'), 'true');
    await page.getByRole('button', { name: 'Resume flight', exact: true }).click();
    assert.equal(await page.locator('body').getAttribute('data-paused'), 'false');
    assert.deepEqual(errors, []);
    console.log('reduced motion: starts paused and resumes on request');
  } finally { await context.close(); }
});
