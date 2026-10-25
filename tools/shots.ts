import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'playwright-core';
import { withBrowser, openCalm, DESKTOP, MOBILE, type DeviceProfile } from './browser.js';

const directory = fileURLToPath(new URL('../shots/', import.meta.url));
const seeds = [42, 7, 1234];
await mkdir(directory, { recursive: true });

type CalmReview = {
  time?: number;
  advance?: (seconds: number) => void;
  forceBreach?: () => void;
  forceSpout?: () => void;
  frameWhale?: (kind?: 'breach' | 'spout') => void;
  frame?: (yaw: number, pitch: number, distance: number) => void;
  stats?: () => Record<string, unknown>;
};

async function settle(page: Page, seconds = 3) {
  await page.waitForFunction(
    () => (window as unknown as { __calmReview?: CalmReview }).__calmReview?.stats,
    null,
    { timeout: 20000 },
  ).catch(() => {});
  await page.waitForTimeout(seconds * 1000);
}

async function capture(
  browser: Browser,
  base: string,
  device: DeviceProfile,
  seed: number,
  path: string,
  query: Record<string, string> = { debug: '1' },
  afterOpen?: (page: Page) => Promise<void>,
) {
  const { page, context, errors } = await openCalm(browser, base, device, { seed, query });
  try {
    await settle(page, device.name === 'mobile' ? 2.5 : 3);
    if (afterOpen) await afterOpen(page);
    await page.screenshot({ path, type: 'png' });
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(`Saved ${path.split('/').pop()}`);
  } finally {
    await context.close();
  }
}

await withBrowser(async (browser, base) => {
  for (const seed of seeds) {
    for (const device of [MOBILE, DESKTOP]) {
      await capture(browser, base, device, seed, `${directory}${device.name}-seed${seed}.png`);
    }
  }

  // Mid-spout / breach moments for review.
  await capture(
    browser,
    base,
    MOBILE,
    42,
    `${directory}mobile-spout.png`,
    { debug: '1' },
    async (page) => {
      await page.evaluate(() => {
        (window as unknown as { __calmReview?: CalmReview }).__calmReview?.forceSpout?.();
      });
      await page.waitForTimeout(400);
      // Re-snap after a couple of ticks so pose + camera agree.
      await page.evaluate(() => {
        (window as unknown as { __calmReview?: CalmReview }).__calmReview?.frameWhale?.('spout');
      });
      await page.waitForTimeout(350);
    },
  );

  await capture(
    browser,
    base,
    MOBILE,
    42,
    `${directory}mobile-breach.png`,
    { debug: '1' },
    async (page) => {
      await page.evaluate(() => {
        (window as unknown as { __calmReview?: CalmReview }).__calmReview?.forceBreach?.();
      });
      await page.waitForTimeout(350);
      await page.evaluate(() => {
        (window as unknown as { __calmReview?: CalmReview }).__calmReview?.frameWhale?.('breach');
      });
      await page.waitForTimeout(300);
    },
  );

  await capture(
    browser,
    base,
    DESKTOP,
    42,
    `${directory}desktop-breach.png`,
    { debug: '1' },
    async (page) => {
      await page.evaluate(() => {
        (window as unknown as { __calmReview?: CalmReview }).__calmReview?.forceBreach?.();
      });
      await page.waitForTimeout(350);
      await page.evaluate(() => {
        (window as unknown as { __calmReview?: CalmReview }).__calmReview?.frameWhale?.('breach');
      });
      await page.waitForTimeout(300);
    },
  );

  // Convenience aliases for the seed-42 heroes.
  await capture(browser, base, MOBILE, 42, `${directory}mobile.png`);
  await capture(browser, base, DESKTOP, 42, `${directory}desktop.png`);
});
