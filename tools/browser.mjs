import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

export const DESKTOP = { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
export const MOBILE = { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' };

export async function withBrowser(run) {
  const app = await startServer({ port: 0 });
  let browser;
  try {
    browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
    return await run(browser, app.url);
  } finally {
    await browser?.close(); await app.close();
  }
}

export async function openFlight(browser, base, device, { seed = 42, reducedMotion = 'no-preference', storage } = {}) {
  const { name, ...options } = device;
  const context = await browser.newContext({ ...options, reducedMotion });
  if (storage) await context.addInitScript((value) => { localStorage.setItem('ejm-fly:v1', JSON.stringify(value)); }, storage);
  const page = await context.newPage(), errors = [], external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => { if (/^https?:/.test(request.url()) && !request.url().startsWith(base)) external.push(request.url()); });
  await page.goto(`${base}/${seed === null ? '' : `?seed=${seed}`}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-ready="true"]', { timeout: 30000 });
  return { page, context, errors, external };
}
