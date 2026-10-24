import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withBrowser, openFlight, DESKTOP, MOBILE } from './browser.mjs';

const directory = fileURLToPath(new URL('../shots/', import.meta.url));
await mkdir(directory, { recursive: true });
await withBrowser(async (browser, base) => {
  for (const device of [DESKTOP, MOBILE]) {
    const { page, context, errors } = await openFlight(browser, base, device);
    try {
      await page.waitForFunction(() => !document.getElementById('beginBtn').disabled);
      await page.waitForTimeout(2600);
      await page.screenshot({ path: `${directory}${device.name}-begin.png` });
      await page.getByRole('button', { name: /^begin$/i }).click();
      await page.waitForTimeout(4500);
      await page.screenshot({ path: `${directory}${device.name}.png` });
      if (device.name === 'desktop') {
        await page.locator('#space').focus();
        await page.keyboard.press('ArrowRight', { delay: 600 });
        await page.waitForTimeout(2200);
        await page.screenshot({ path: `${directory}desktop-turn.png` });
      }
      if (errors.length) throw new Error(errors.join('\n'));
      console.log(`Saved ${device.name} views`);
    } finally { await context.close(); }
  }
});
