import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withBrowser, openFlight, DESKTOP, MOBILE } from './browser.mjs';

const directory = fileURLToPath(new URL('../shots/', import.meta.url));
const quick = process.argv.includes('--quick');
await mkdir(directory, { recursive: true });
await withBrowser(async (browser, base) => {
  for (const device of [DESKTOP, MOBILE]) {
    const { page, context, errors } = await openFlight(browser, base, device, { query: { debug: '1' } });
    try {
      await page.waitForFunction(() => !document.getElementById('beginBtn').disabled);
      await page.waitForTimeout(2600);
      await page.screenshot({ path: `${directory}${device.name}-begin.png` });
      await page.getByRole('button', { name: /^begin$/i }).click();
      const began = Date.now();
      await page.waitForTimeout(4500);
      await page.screenshot({ path: `${directory}${device.name}.png` });
      if (device.name === 'desktop') {
        await page.locator('#space').focus();
        await page.keyboard.press('ArrowRight', { delay: 600 });
        await page.waitForTimeout(2200);
        await page.screenshot({ path: `${directory}desktop-turn.png` });
        if (!quick) {
          await page.locator('#aboutBtn').click();
          await page.waitForTimeout(500);
          await page.screenshot({ path: `${directory}desktop-about.png` });
          await page.keyboard.press('Escape');
          await page.evaluate(() => window.__flightReview.advance(Math.max(0, 60 - window.__flightReview.time)));
          await page.waitForTimeout(600);
          await page.screenshot({ path: `${directory}desktop-midflight.png` });
        }
      }
      if (errors.length) throw new Error(errors.join('\n'));
      console.log(`Saved ${device.name} views`);
    } finally { await context.close(); }
  }
  if (!quick) for (const [name, query] of [
    ['region-ember', { debugRegion: 'ember' }], ['region-hollow', { debugRegion: 'hollow' }],
    ...['comet', 'binary', 'pulsar'].map((kind) => [`event-${kind}`, { debugEvent: kind }]),
    ...['rocky', 'ocean', 'ice', 'ember'].map((type) => [`planet-${type}`, { debugPlanet: type }]),
  ]) {
    const { page, context, errors } = await openFlight(browser, base, DESKTOP, { query: { debug: '1', ...query } });
    try {
      await page.getByRole('button', { name: /^begin$/i }).click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${directory}${name}.png` });
      if (errors.length) throw new Error(errors.join('\n'));
      console.log(`Saved ${name}`);
    } finally { await context.close(); }
  }
});
