import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import { withBrowser, openCalm, DESKTOP, MOBILE } from './browser.js';

type DrawWindow = Window & { __draws: number; __frameDraws: number[] };

async function pixels(page: Page) {
  const snapshot = (await page.locator('#space').screenshot()).toString('base64');
  const size = await page.locator('#space').evaluate((canvas) => ({ width: (canvas as HTMLCanvasElement).width, height: (canvas as HTMLCanvasElement).height }));
  // Decode on a blank page: the app's CSP does not allow data: images.
  const scratch = await page.context().newPage();
  try {
    return { ...await scratch.evaluate(decode, snapshot), ...size };
  } finally {
    await scratch.close();
  }
}

async function decode(encoded: string) {
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
  return { min, max, nonBlack };
}

await withBrowser(async (browser, base) => {
  for (const device of [DESKTOP, MOBILE]) {
    const { page, context, errors, external } = await openCalm(browser, base, device, { instrument: true });
    try {
      assert.equal(new URL(page.url()).searchParams.get('seed'), '42');
      await page.waitForTimeout(1200);
      assert.deepEqual(errors, [], `Rendering must stay free of errors (${device.name})`);
      const picture = await pixels(page);
      assert.ok(picture.nonBlack > 500 && picture.max - picture.min > 25, `Canvas must contain a rendered scene: ${JSON.stringify(picture)}`);
      if (device.name === 'mobile') assert.ok(picture.width <= 390 * 2 + 1, 'Mobile DPR is capped');

      const sound = page.getByRole('button', { name: 'Sound', exact: true });
      assert.equal(await sound.getAttribute('aria-pressed'), 'false');
      await sound.click();
      assert.equal(await sound.getAttribute('aria-pressed'), 'true');
      await sound.click();
      assert.equal(await sound.getAttribute('aria-pressed'), 'false');

      await page.locator('#aboutBtn').click();
      assert.equal(await page.locator('#about').evaluate((panel) => (panel as HTMLElement).inert), false);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#about').evaluate((panel) => (panel as HTMLElement).inert), true);

      await page.locator('#space').focus();
      assert.equal(await page.locator('#space').evaluate((canvas) => getComputedStyle(canvas).borderRadius), '0px', 'Focus must never clip the view');

      const peakDraws = await page.evaluate(() => {
        const draws = (window as unknown as DrawWindow).__frameDraws;
        return draws.length ? Math.max(...draws) : 0;
      });
      assert.ok(peakDraws < 200, `The ${device.name} draw budget stays bounded: ${peakDraws}`);

      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(150);
      const hiddenDraws = await page.evaluate(() => (window as unknown as DrawWindow).__draws);
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => (window as unknown as DrawWindow).__draws), hiddenDraws, 'Hidden documents make no rendering calls');
      await page.evaluate(() => {
        delete (document as { hidden?: boolean }).hidden;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForFunction((before) => (window as unknown as DrawWindow).__draws > before, hiddenDraws, { timeout: 30000 });

      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ejm-calm:v1')!));
      assert.equal(saved.version, 1);
      assert.equal(saved.seed, 42);

      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
      console.log(`${device.name}: rendering and controls passed; ${peakDraws} peak draws; hidden views stay still`);
    } finally {
      await context.close();
    }
  }

  const { page, context, errors } = await openCalm(browser, base, DESKTOP, { reducedMotion: 'reduce', seed: 0 });
  try {
    await page.waitForTimeout(600);
    assert.equal(new URL(page.url()).searchParams.get('seed'), '0');
    assert.deepEqual(errors, []);
    console.log('reduced motion: scene loads without errors');
  } finally {
    await context.close();
  }
});
