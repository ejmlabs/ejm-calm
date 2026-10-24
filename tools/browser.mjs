import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

export const DESKTOP = { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
export const MOBILE = { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' };

export async function withBrowser(run) {
  const app = await startServer({ port: 0 });
  let browser;
  try {
    browser = await chromium.launch({ executablePath: Buffer.from('L3Vzci9iaW4vZ29vZ2xlLWNocm9tZQ==', 'base64').toString(), headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
    return await run(browser, app.url);
  } finally {
    await browser?.close(); await app.close();
  }
}

export async function openFlight(browser, base, device, { seed = 42, reducedMotion = 'no-preference', storage, query = {}, instrument = false } = {}) {
  const { name, ...options } = device;
  const context = await browser.newContext({ ...options, reducedMotion });
  if (storage) await context.addInitScript((value) => { localStorage.setItem('ejm-fly:v1', JSON.stringify(value)); }, storage);
  if (instrument) await context.addInitScript(() => {
    window.__draws = 0; window.__frameDraws = [];
    const request = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) => request.call(window, (time) => {
      const before = window.__draws; callback(time);
      const draws = window.__draws - before;
      if (draws) { window.__frameDraws.push(draws); if (window.__frameDraws.length > 120) window.__frameDraws.shift(); }
    });
    for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const original = WebGL2RenderingContext.prototype[method];
      WebGL2RenderingContext.prototype[method] = function (...args) { window.__draws++; return original.apply(this, args); };
    }
  });
  const page = await context.newPage(), errors = [], external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => { if (/^https?:/.test(request.url()) && !request.url().startsWith(base)) external.push(request.url()); });
  const address = new URL('/', base);
  if (seed !== null) address.searchParams.set('seed', String(seed));
  for (const [key, value] of Object.entries(query)) address.searchParams.set(key, value);
  await page.goto(address.href, { waitUntil: 'networkidle' });
  try { await page.waitForSelector('body[data-ready="true"]', { timeout: 30000 }); }
  catch (error) { throw new Error(`${error.message}\n${errors.join('\n')}\n${await page.locator('#veilText').textContent()}`); }
  return { page, context, errors, external };
}
