import { resolve } from 'node:path';
import type { Browser } from 'playwright-core';
import { startServer } from './serve.js';
import { DESKTOP, MOBILE, launchBrowser, type DeviceProfile } from './browser.js';

/**
 * Load time on a normal connection: cold loads of a built site through a throttled network (9 Mbps down,
 * 1.5 Mbps up, 170 ms round trip), timing first paint, first contentful paint and the first frame of the sea
 * (`body[data-ready]`) by the browser's own clocks. With two builds, the second is compared to the first and the
 * run fails if any median grows by a second or more. Bytes are reported, never capped.
 *
 * usage: npx tsx tools/load-time.ts [build directory] [build directory to compare] [runs]    (defaults: dist, none, 5)
 */

const NETWORK = { offline: false, latency: 170, downloadThroughput: (9e6 / 8) | 0, uploadThroughput: (1.5e6 / 8) | 0 };
/** Phones also get a slower CPU, as in the usual mobile lab profile. */
const CPU_SLOWDOWN: Record<string, number> = { desktop: 1, mobile: 4 };
/** A change that adds this much to any median fails the comparison. */
const LIMIT_MS = 1000;

type Sample = { firstPaint: number; firstContentfulPaint: number; ready: number; kilobytes: number };
type Row = Record<keyof Sample, number>;

const builds = [process.argv[2] ?? 'dist', process.argv[3]].filter((b): b is string => Boolean(b)).map((b) => resolve(b));
const runs = Number(process.argv[4] ?? 5);

async function sample(browser: Browser, url: string, device: DeviceProfile): Promise<Sample> {
  const { name: _name, ...options } = device;
  // A fresh context per load: an empty cache, as on a first visit.
  const context = await browser.newContext(options);
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', NETWORK);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN[device.name] ?? 1 });
    let bytes = 0;
    cdp.on('Network.loadingFinished', (event: { encodedDataLength: number }) => {
      bytes += event.encodedDataLength;
    });
    await page.goto(`${url}?seed=42`, { waitUntil: 'commit' });
    await page.waitForSelector('body[data-ready="true"]', { timeout: 120000 });
    // No helper functions inside: the page cannot see the names the TypeScript loader adds to them.
    const [firstPaint, firstContentfulPaint, ready] = await page.evaluate(() => [
      performance.getEntriesByName('first-paint')[0]?.startTime ?? NaN,
      performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? NaN,
      performance.now(),
    ]);
    return { firstPaint: firstPaint!, firstContentfulPaint: firstContentfulPaint!, ready: ready!, kilobytes: bytes / 1024 };
  } finally {
    await context.close();
  }
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

async function measure(browser: Browser, root: string): Promise<Record<string, Row>> {
  const app = await startServer({ port: 0, root });
  try {
    const out: Record<string, Row> = {};
    for (const device of [DESKTOP, MOBILE]) {
      const samples: Sample[] = [];
      for (let n = 0; n < runs; n++) samples.push(await sample(browser, app.url, device));
      out[device.name] = {
        firstPaint: median(samples.map((s) => s.firstPaint)),
        firstContentfulPaint: median(samples.map((s) => s.firstContentfulPaint)),
        ready: median(samples.map((s) => s.ready)),
        kilobytes: median(samples.map((s) => s.kilobytes)),
      };
      console.log(JSON.stringify({ build: root, device: device.name, runs, ...out[device.name] }));
    }
    return out;
  } finally {
    await app.close();
  }
}

const browser = await launchBrowser();
try {
  const results = [];
  for (const root of builds) results.push(await measure(browser, root));
  if (results.length === 2) {
    const [base, next] = results as [Record<string, Row>, Record<string, Row>];
    const slower: string[] = [];
    for (const device of Object.keys(base)) {
      for (const metric of ['firstPaint', 'firstContentfulPaint', 'ready'] as const) {
        const added = next[device]![metric] - base[device]![metric];
        console.log(`${device} ${metric}: ${base[device]![metric].toFixed(0)} → ${next[device]![metric].toFixed(0)} ms (${added >= 0 ? '+' : ''}${added.toFixed(0)})`);
        if (added >= LIMIT_MS) slower.push(`${device} ${metric} +${added.toFixed(0)} ms`);
      }
    }
    if (slower.length) {
      console.error(`Load time grew by a second or more: ${slower.join(', ')}`);
      process.exitCode = 1;
    }
  }
} finally {
  await browser.close();
}
