// Copies the public static tree into dist/ and writes host response headers.
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSP_HEADER } from './serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'dist');
const FILES = ['index.html', 'styles.css', 'LICENSE', 'THIRD_PARTY_NOTICES'];
const DIRS = ['src', 'vendor'];

const HEADERS = `/*
  Content-Security-Policy: ${CSP_HEADER}
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Strict-Transport-Security: max-age=31536000
  Cache-Control: public, max-age=0, must-revalidate
`;

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const file of FILES) await cp(resolve(ROOT, file), resolve(OUT, file));
for (const dir of DIRS) await cp(resolve(ROOT, dir), resolve(OUT, dir), { recursive: true });
await writeFile(resolve(OUT, '_headers'), HEADERS);
console.log('Built dist/');
