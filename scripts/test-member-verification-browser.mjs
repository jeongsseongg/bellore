import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
]);

function findBrowser() {
  const candidates = [
    process.env.CHROME_BIN,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  for (const command of ['google-chrome', 'google-chrome-stable', 'chromium', 'chrome']) {
    const result = spawnSync(command, ['--version'], { encoding: 'utf8' });
    if (result.status === 0) return command;
  }
  throw new Error('Chrome/Chromium is required for the member verification DOM gate.');
}

function safeFile(url) {
  const pathname = decodeURIComponent(new URL(url, 'http://127.0.0.1').pathname).replace(/^\/+/, '');
  const absolute = normalize(resolve(root, pathname));
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) return null;
  return absolute;
}

const server = createServer((request, response) => {
  const file = safeFile(request.url || '/');
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': mime.get(extname(file)) || 'application/octet-stream', 'Cache-Control': 'no-store' });
  response.end(readFileSync(file));
});

await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const port = server.address().port;
const profile = mkdtempSync(join(tmpdir(), 'bellore-auth-browser-'));
const browser = findBrowser();

try {
  const output = await new Promise((resolveRun, rejectRun) => {
    const child = spawn(browser, [
      '--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--no-default-browser-check',
      '--no-sandbox', '--virtual-time-budget=5000', `--user-data-dir=${profile}`, '--dump-dom',
      `http://127.0.0.1:${port}/scripts/fixtures/member-verification-runtime.html`,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timeoutMs = 60000;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectRun(new Error(`browser runtime gate timed out after ${timeoutMs}ms: ${stderr.slice(-800)}`));
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      rejectRun(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) rejectRun(new Error(`browser exited ${code}: ${stderr.slice(-800)}`));
      else resolveRun(stdout);
    });
  });
  assert.match(output, /<body data-status="passed">/);
  const encoded = output.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || '';
  const payload = JSON.parse(encoded.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>'));
  assert.deepEqual(payload, {
    solapiSend: 0, solapiVerify: 0, portOne: 2, identityVerify: 2,
    customer: {
      fullName: '홍길동', phoneNumber: '01012345678',
      birthYear: '1990', birthMonth: '01', birthDay: '02',
    },
    fixedUser: 'Y',
    carrierAgency: 'SMS',
    easyAgency: null,
  });
  console.log('member verification browser runtime: carrier-sms=1 easy-auth=1 solapi=0 passed');
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
  rmSync(profile, { recursive: true, force: true });
}
