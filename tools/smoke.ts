import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import { withBrowser, openFlight, DESKTOP, MOBILE } from './browser.js';

type DrawWindow = Window & { __draws: number; __frameDraws: number[] };

async function pixels(page: Page) {
  const snapshot = (await page.locator('#space').screenshot()).toString('base64');
  return page.locator('#space').evaluate(async (canvas, encoded) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const copy = document.createElement('canvas');
    copy.width = 96;
    copy.height = 64;
    const context = copy.getContext('2d');
    if (!context) throw new Error('2d context unavailable');
    context.drawImage(image, 0, 0, copy.width, copy.height);
    const data = context.getImageData(0, 0, copy.width, copy.height).data;
    let min = 765;
    let max = 0;
    let nonBlack = 0;
    for (let i = 0; i < data.length; i += 4) {
      const value = data[i]! + data[i + 1]! + data[i + 2]!;
      min = Math.min(min, value);
      max = Math.max(max, value);
      if (value > 9) nonBlack++;
    }
    return { min, max, nonBlack, width: (canvas as HTMLCanvasElement).width, height: (canvas as HTMLCanvasElement).height };
  }, snapshot);
}

await withBrowser(async (browser, base) => {
  for (const device of [DESKTOP, MOBILE]) {
    const { page, context, errors, external } = await openFlight(browser, base, device, { instrument: true });
    try {
      assert.equal(new URL(page.url()).searchParams.get('seed'), '42');
      assert.equal(await page.locator('body').getAttribute('data-started'), null);
      await page.getByRole('button', { name: /^begin$/i }).click();
      await page.waitForTimeout(1800);
      assert.deepEqual(errors, [], 'Rendering must stay free of errors during streaming');
      assert.equal(await page.locator('body').getAttribute('data-started'), 'true');
      const picture = await pixels(page);
      assert.ok(picture.nonBlack > 500 && picture.max - picture.min > 25, `Canvas must contain a rendered scene: ${JSON.stringify(picture)}`);
      if (device.name === 'mobile') assert.ok(picture.width <= 390 * 1.25 + 1, 'Mobile DPR is capped');
      assert.equal(
        await page.locator('#space').evaluate((canvas) => (canvas as HTMLCanvasElement).getContext('webgl2')!.getContextAttributes()!.antialias),
        false,
        'Canvas MSAA is off; HDR targets carry samples',
      );
      const sound = page.getByRole('button', { name: 'Sound', exact: true });
      await sound.click();
      assert.equal(await sound.getAttribute('aria-pressed'), 'false');
      await sound.click();
      assert.equal(await sound.getAttribute('aria-pressed'), 'true');
      await page.locator('#aboutBtn').click();
      assert.equal(await page.locator('#about').evaluate((panel) => (panel as HTMLElement).inert), false);
      await page.keyboard.press('Escape');
      await page.locator('#space').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#space').evaluate((canvas) => getComputedStyle(canvas).borderRadius), '0px', 'Keyboard focus must never clip the view');
      const peakDraws = await page.evaluate(() => Math.max(...(window as unknown as DrawWindow).__frameDraws));
      assert.ok(peakDraws < 180, `The ${device.name} draw budget stays bounded: ${peakDraws}`);
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      assert.equal(await page.locator('body').getAttribute('data-paused'), 'true');
      const first = await page.evaluate(() => JSON.parse(localStorage.getItem('ejm-fly:v1')!));
      await page.waitForTimeout(450);
      const pausedDraws = await page.evaluate(() => (window as unknown as DrawWindow).__draws);
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => (window as unknown as DrawWindow).__draws), pausedDraws, 'A still paused view makes no rendering calls');
      await page.locator('#space').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.locator('body').getAttribute('data-paused'), 'false');
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(150);
      const hiddenDraws = await page.evaluate(() => (window as unknown as DrawWindow).__draws);
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => (window as unknown as DrawWindow).__draws), hiddenDraws, 'Hidden documents make no rendering calls');
      await page.evaluate(() => {
        delete (document as { hidden?: boolean }).hidden;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForFunction((before) => (window as unknown as DrawWindow).__draws > before, hiddenDraws, { timeout: 30000 });
      await page.waitForTimeout(400);
      await page.keyboard.press('Space');
      const second = await page.evaluate(() => JSON.parse(localStorage.getItem('ejm-fly:v1')!));
      assert.ok(second.flight.time > first.flight.time, 'Flight resumes after pause');
      assert.equal(second.sound.volume, 0.5);
      const position = second.flight.position as number[];
      await page.goto(`${base}/`, { waitUntil: 'networkidle' });
      await page.waitForSelector('body[data-ready="true"]');
      await page.getByRole('button', { name: /^begin$/i }).click();
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('ejm-fly:v1')!));
      assert.ok(Math.hypot(...restored.flight.position.map((n: number, i: number) => n - position[i]!)) < 10, 'A URL without a seed resumes the saved flight');
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
      console.log(`${device.name}: rendering and controls passed; ${peakDraws} peak draws; paused/hidden views stay still`);
    } finally {
      await context.close();
    }
  }
  const { page, context, errors } = await openFlight(browser, base, DESKTOP, { reducedMotion: 'reduce', seed: 0 });
  try {
    await page.getByRole('button', { name: /^begin$/i }).click();
    assert.equal(await page.locator('body').getAttribute('data-paused'), 'true');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    assert.equal(await page.locator('body').getAttribute('data-paused'), 'false');
    assert.deepEqual(errors, []);
    console.log('reduced motion: starts paused and resumes on request');
  } finally {
    await context.close();
  }
});
