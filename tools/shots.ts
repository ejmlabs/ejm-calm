import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'playwright-core';
import { withBrowser, openFlight, DESKTOP, MOBILE, type DeviceProfile } from './browser.js';

const directory = fileURLToPath(new URL('../shots/', import.meta.url));
const quick = process.argv.includes('--quick');
const seeds = [42, 7, 1234, 98765];
await mkdir(directory, { recursive: true });

type FlightReview = {
  stats?: () => { bakeMs?: number; exposure?: number };
  time?: number;
  advance?: (seconds: number) => void;
  frameRing?: (degrees: number) => void;
  nebulae?: () => Array<{ position: number[]; radius: number }>;
  place?: (position: number[], yaw: number, pitch: number) => void;
};

async function settle(page: Page, seconds = 6) {
  await page.waitForFunction(() => (window as unknown as { __flightReview?: FlightReview }).__flightReview?.stats, null, { timeout: 20000 }).catch(() => {});
  const started = Date.now();
  while (Date.now() - started < seconds * 1000) {
    const ready = await page
      .evaluate(() => {
        const review = (window as unknown as { __flightReview?: FlightReview }).__flightReview;
        const stats = review?.stats?.() ?? {};
        return { bake: stats.bakeMs ?? 0, exposure: stats.exposure ?? 1, time: review?.time ?? 0 };
      })
      .catch(() => ({ bake: 0, exposure: 1, time: 0 }));
    if (ready.time > 2.5 && ready.bake < 0.05) break;
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(900);
}

async function captureHero(browser: Browser, base: string, device: DeviceProfile, seed: number, path: string) {
  const { page, context, errors } = await openFlight(browser, base, device, { seed, query: { debug: '1' } });
  try {
    await page.waitForFunction(() => !(document.getElementById('beginBtn') as HTMLButtonElement | null)?.disabled);
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /^begin$/i }).click();
    await settle(page, device.name === 'mobile' ? 7 : 8);
    await page.screenshot({ path });
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(`Saved ${path.split('/').pop()}`);
  } finally {
    await context.close();
  }
}

await withBrowser(async (browser, base) => {
  for (const device of [DESKTOP, MOBILE]) {
    const { page, context, errors } = await openFlight(browser, base, device, { seed: 42, query: { debug: '1' } });
    try {
      await page.waitForFunction(() => !(document.getElementById('beginBtn') as HTMLButtonElement | null)?.disabled);
      await page.waitForTimeout(2600);
      await page.screenshot({ path: `${directory}${device.name}-begin.png` });
      await page.getByRole('button', { name: /^begin$/i }).click();
      await settle(page, 8);
      await page.screenshot({ path: `${directory}${device.name}.png` });
      await page.screenshot({ path: `${directory}${device.name}-seed42.png` });
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
          await page.evaluate(() => {
            const review = (window as unknown as { __flightReview: FlightReview }).__flightReview;
            review.advance?.(Math.max(0, 60 - (review.time ?? 0)));
          });
          await page.waitForTimeout(800);
          await page.screenshot({ path: `${directory}desktop-midflight.png` });
        }
      }
      if (errors.length) throw new Error(errors.join('\n'));
      console.log(`Saved ${device.name} hero views`);
    } finally {
      await context.close();
    }
  }

  if (!quick) {
    for (const seed of seeds.slice(1)) {
      for (const device of [DESKTOP, MOBILE]) {
        await captureHero(browser, base, device, seed, `${directory}${device.name}-seed${seed}.png`);
      }
    }

    {
      // Seed 98765 opens rings ~25° with preferRings; 42 sits nearly edge-on.
      const { page, context, errors } = await openFlight(browser, base, DESKTOP, { seed: 98765, query: { debug: '1', debugRing: '1' } });
      try {
        await page.getByRole('button', { name: /^begin$/i }).click();
        await settle(page, 8);
        await page.evaluate(() => (window as unknown as { __flightReview?: FlightReview }).__flightReview?.frameRing?.(22));
        await settle(page, 5);
        await page.screenshot({ path: `${directory}desktop-ring.png` });
        if (errors.length) throw new Error(errors.join('\n'));
        console.log('Saved desktop-ring');
      } finally {
        await context.close();
      }
    }

    {
      const { page, context, errors } = await openFlight(browser, base, DESKTOP, { seed: 42, query: { debug: '1', debugRegion: 'ember' } });
      try {
        await page.getByRole('button', { name: /^begin$/i }).click();
        await settle(page, 5);
        await page.evaluate(() => {
          const review = (window as unknown as { __flightReview: FlightReview }).__flightReview;
          const list = review.nebulae?.() ?? [];
          const nebula = list.sort((a, b) => a.radius - b.radius).at(-1) ?? list[0];
          if (!nebula) return;
          const position = [
            nebula.position[0]! - nebula.radius * 0.05,
            nebula.position[1]! + nebula.radius * 0.12,
            nebula.position[2]! + nebula.radius * 0.05,
          ];
          review.place?.(position, Math.PI * 0.5, 0.12);
        });
        await page.waitForTimeout(5500);
        await page.locator('#space').focus();
        for (let i = 0; i < 10; i++) {
          await page.mouse.move(720, 450);
          await page.mouse.down();
          await page.mouse.move(720, 420);
          await page.mouse.up();
          await page.waitForTimeout(40);
        }
        await settle(page, 6);
        await page.screenshot({ path: `${directory}desktop-nebula.png` });
        if (errors.length) throw new Error(errors.join('\n'));
        console.log('Saved desktop-nebula');
      } finally {
        await context.close();
      }
    }

    for (const [name, query, seed] of [
      ['region-ember', { debug: '1', debugRegion: 'ember' }, 42],
      ['region-hollow', { debug: '1', debugRegion: 'hollow' }, 42],
      ...(['comet', 'binary', 'pulsar'] as const).map((kind) => [`event-${kind}`, { debug: '1', debugEvent: kind }, 42] as const),
      ...(['rocky', 'ocean', 'ice', 'ember'] as const).map((type) => [`planet-${type}`, { debug: '1', debugPlanet: type }, 42] as const),
    ] as Array<[string, Record<string, string>, number]>) {
      const { page, context, errors } = await openFlight(browser, base, DESKTOP, { seed, query });
      try {
        await page.getByRole('button', { name: /^begin$/i }).click();
        await settle(page, 7);
        await page.screenshot({ path: `${directory}${name}.png` });
        if (errors.length) throw new Error(errors.join('\n'));
        console.log(`Saved ${name}`);
      } finally {
        await context.close();
      }
    }
  }
});
