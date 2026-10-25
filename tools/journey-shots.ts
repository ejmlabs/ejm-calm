import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from 'playwright-core';
import { withBrowser, openCalm, DESKTOP, MOBILE } from './browser.js';

/**
 * Review shots of the whale journey: the chase over time, a frame far from the
 * start after a long swim, a deep-dive frame under water and one across the
 * surface. Uses the ?debug=1 hooks only. Writes PNGs and perf.json to the
 * directory given as the first argument (run `npm run build` first).
 */

type Stats = Record<string, unknown> & {
  whale: number[];
  whaleHeading: number;
  cam: number[];
  origin: number[];
  camMode: string;
  submersion: number;
  phase: string;
  draws: number;
  triangles: number;
};

type CalmReview = {
  travel: (seconds: number) => void;
  forceDeepDive: (at?: number) => void;
  peekUnderwater: (depth: number | null) => void;
  stats: () => Stats;
};

type DrawWindow = Window & { __frameDraws: number[]; __calmReview: CalmReview };

const target = process.argv[2];
if (!target) {
  console.error('usage: npx tsx tools/journey-shots.ts <output directory>');
  process.exit(1);
}
const directory = resolve(target);
await mkdir(directory, { recursive: true });

const seeds = [42, 7, 1234];
/** Minutes of swimming before the travel frame. */
const TRAVEL_MINUTES = 12;

const stats = (page: Page) => page.evaluate(() => (window as unknown as DrawWindow).__calmReview.stats());
/** Calls one review hook by name; arguments are passed as JSON. */
const review = <K extends Exclude<keyof CalmReview, 'stats'>>(page: Page, hook: K, ...args: Parameters<CalmReview[K]>) =>
  page.evaluate(`window.__calmReview.${hook}(...${JSON.stringify(args)})`);

/** Frames per second over a short window, plus the median GL draw calls per frame. */
async function measure(page: Page): Promise<{ fps: number; glDraws: number }> {
  // A string, so the bundler's name helpers never reach the page.
  return page.evaluate(`(async () => {
    let frames = 0;
    const start = performance.now();
    await new Promise((done) => {
      const step = () => {
        frames++;
        if (performance.now() - start < 2000) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
    const draws = [...window.__frameDraws].sort((a, b) => a - b);
    return { fps: (frames * 1000) / (performance.now() - start), glDraws: draws[Math.floor(draws.length / 2)] ?? 0 };
  })()`) as Promise<{ fps: number; glDraws: number }>;
}

async function waitFor(page: Page, check: (s: Stats) => boolean, seconds: number): Promise<Stats> {
  const until = Date.now() + seconds * 1000;
  let s = await stats(page);
  while (!check(s) && Date.now() < until) {
    await page.waitForTimeout(250);
    s = await stats(page);
  }
  return s;
}

const round = (v: number) => Math.round(v * 10) / 10;
const camToWhale = (s: Stats) => {
  const wx = s.whale[0]! - s.origin[0]!;
  const wz = s.whale[2]! - s.origin[1]!;
  return round(Math.hypot(s.cam[0]! - wx, s.cam[1]! - s.whale[1]!, s.cam[2]! - wz));
};

const perf: Record<string, unknown>[] = [];
const problems: string[] = [];

await withBrowser(async (browser, base) => {
  for (const device of [DESKTOP, MOBILE]) {
    for (const seed of seeds) {
      const name = `${device.name}-seed${seed}`;
      const { page, context, errors } = await openCalm(browser, base, device, { seed, query: { debug: '1' }, instrument: true });
      const shot = async (label: string) => {
        await page.screenshot({ path: resolve(directory, `${name}-${label}.png`) });
        const s = await stats(page);
        const m = await measure(page);
        const entry = {
          shot: `${name}-${label}`, ...m, draws: s.draws, triangles: s.triangles,
          landTriangles: s.landTriangles, chunks: s.chunks, ships: s.ships,
          camMode: s.camMode, submersion: round(s.submersion), phase: s.phase,
          heading: round(s.whaleHeading), camToWhale: camToWhale(s),
        };
        perf.push(entry);
        console.log(JSON.stringify(entry));
        if (entry.camToWhale < 6) problems.push(`${entry.shot}: camera ${entry.camToWhale} m from the whale`);
        return s;
      };
      try {
        await page.waitForTimeout(3000);

        // The chase over time: swim a few seconds between frames, then let the camera settle in real frames.
        for (let i = 1; i <= 4; i++) {
          if (i > 1) await review(page, 'travel', 3);
          await page.waitForTimeout(1500);
          await shot(`follow-${i}`);
        }

        await review(page, 'travel', TRAVEL_MINUTES * 60);
        // Swim on until the whale is back at the surface, so the frame shows the new coast.
        for (let i = 0; i < 40 && (await stats(page)).whale[1]! < -2; i++) await review(page, 'travel', 5);
        await page.waitForTimeout(6000);
        const far = await shot('travel');
        const swum = Math.hypot(far.whale[0]!, far.whale[2]!);
        console.log(`${name}: origin ${far.origin.map(round).join(', ')}, whale ${round(swum)} m from the start`);
        perf[perf.length - 1]!.distanceFromStart = round(swum);

        // The chase camera follows the deep dive under.
        await review(page, 'forceDeepDive', 0.3);
        await waitFor(page, (s) => s.submersion >= 1 && s.camMode === 'under', 30);
        await page.waitForTimeout(2500);
        await shot('underwater');

        // Debug camera on the waterline, so the near plane straddles the surface.
        await review(page, 'peekUnderwater', 0.08);
        await page.waitForTimeout(2000);
        await shot('surface');
        await review(page, 'peekUnderwater', null);

        if (errors.length) problems.push(`${name}: ${errors.join(' | ')}`);
      } finally {
        await context.close();
      }
    }
  }
});

await writeFile(resolve(directory, 'perf.json'), `${JSON.stringify(perf, null, 2)}\n`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
}
