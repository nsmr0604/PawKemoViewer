// Usage: node tests/android_installed_smoke.mjs <serial> [adb path] [screenshot directory] [app ID]
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const [serial, adbPath = 'adb', screenshotDir, app = 'com.nsmr0604.pawkemoviewer'] = process.argv.slice(2);
assert.match(serial ?? '', /^[\w.:-]+$/, 'Specify the Android device serial');
assert.match(app, /^com\.nsmr0604\.pawkemoviewer(?:\.localetest)?$/, 'Unsupported PawKemoViewer app ID');
const dumpPath = `/data/local/tmp/pawkemoviewer-${randomUUID()}.xml`;
const locales = ['ja', 'en'].map(language =>
  JSON.parse(readFileSync(new URL(`../src/locales/${language}.json`, import.meta.url), 'utf8')));
const labels = key => locales.map(locale => locale[key]);
const adb = (...args) => execFileSync(adbPath, ['-s', serial, ...args], {
  encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'],
});
const shell = (...args) => adb('shell', ...args);
const disconnected = error => /device .*not found|device offline|no devices\/emulators/i
  .test(error.stderr ?? '');

function screenshot(name) {
  if (!screenshotDir) return;
  mkdirSync(screenshotDir, { recursive: true });
  const png = execFileSync(adbPath, ['-s', serial, 'exec-out', 'screencap', '-p'], {
    timeout: 10000, maxBuffer: 12 * 1024 * 1024,
  });
  writeFileSync(join(screenshotDir, `${name}.png`), png);
}
const decode = value => value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (_, entity) => {
  if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
  if (entity.startsWith('#')) return String.fromCodePoint(Number(entity.slice(1)));
  return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[entity];
});

function screen() {
  assert.match(shell('uiautomator', 'dump', dumpPath), /dumped to:/i, 'UI dump failed');
  const nodes = [...adb('exec-out', 'cat', dumpPath).matchAll(/<node\s+([^>]+)>/g)].map(([, raw]) => {
    const attributes = Object.fromEntries([...raw.matchAll(/([\w-]+)="([^"]*)"/g)]
      .map(([, name, value]) => [name, decode(value)]));
    return { ...attributes, area: attributes.bounds.match(/\d+/g).map(Number) };
  });
  assert.ok(nodes.length, 'Empty UI hierarchy');
  return nodes;
}

async function waitFor(description, check) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = check(screen());
    if (result) return result;
    await delay(300);
  }
  assert.fail(description);
}

function match(nodes, key, accept = () => true) {
  return nodes.find(node => node.package === app && labels(key).some(label =>
    label && [node.text, node['content-desc']].includes(label))
    && node.area[2] > node.area[0] && node.area[3] > node.area[1] && accept(node));
}

const button = node => node.clickable === 'true' && node.enabled === 'true';

function tap({ area: [left, top, right, bottom] }) {
  shell('input', 'tap', String(Math.round((left + right) / 2)), String(Math.round((top + bottom) / 2)));
}

function scroll(nodes) {
  const web = nodes.find(node => node.package === app && node.class === 'android.webkit.WebView');
  assert.ok(web, 'App WebView is not visible');
  const [left, top, right, bottom] = web.area;
  const x = Math.round((left + right) / 2);
  const point = fraction => String(Math.round(top + (bottom - top) * fraction));
  shell('input', 'swipe', String(x), point(0.78), String(x), point(0.36), '400');
}

function findBelow(key, accept) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const nodes = screen();
    const nav = match(nodes, 'nav.home', button);
    const control = match(nodes, key, node => (!accept || accept(node))
      && (!nav || node.area[3] <= nav.area[1]));
    if (control) return control;
    scroll(nodes);
  }
  assert.fail(`Control not found: ${key}`);
}

let pickerOpen = false;
let failures = 0;
async function test(name, run) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    if (disconnected(error)) throw error;
    failures++;
    console.error(`FAIL ${name} — ${error.message}`);
  }
}

async function picker(key, save = false) {
  tap(findBelow(key, button));
  try {
    const nodes = await waitFor('Android DocumentsUI did not open', nodes => {
      pickerOpen = nodes.some(node => node.package.endsWith('.documentsui'));
      return pickerOpen && nodes;
    });
    screenshot(key);
    if (save) {
      assert.ok(nodes.some(node => node.package.endsWith('.documentsui')
        && node.class === 'android.widget.EditText' && /^pawkemoviewer-backup(?:\.json)?$/i.test(node.text)),
      'The save picker did not suggest a PawKemoViewer backup name');
    }
  } finally {
    if (pickerOpen) {
      shell('input', 'keyevent', 'KEYCODE_BACK');
      pickerOpen = false;
    }
  }
  await waitFor('Settings did not recover after cancel', nodes => match(nodes, key, button));
}

try {
  const resolve = shell('cmd', 'package', 'resolve-activity', '--brief', '-a',
    'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-p', app).trim().split(/\s+/).at(-1);
  assert.ok(resolve.startsWith(`${app}/`), 'PawKemoViewer launcher is unavailable');
  assert.match(shell('am', 'start', '-W', '-n', resolve), /Status: ok/);
  const home = await waitFor('Home navigation is missing', nodes => match(nodes, 'nav.home', button));
  tap(home);
  const settings = await waitFor('Settings navigation is missing', nodes => match(nodes, 'nav.settings', button));
  tap(settings);
  tap(findBelow('settings.languageTitle', button));
  await test('settings language controls render', () => {
    findBelow('settings.language');
    screenshot('settings-language');
  });
  await test('language import picker opens and cancels', () => picker('settings.localePickerOpen'));
  tap(await waitFor('Settings navigation is missing', nodes => match(nodes, 'nav.settings', button)));
  tap(findBelow('settings.navBackup', button));
  await test('default backup save is available', () => {
    findBelow('settings.backupDefaultSave', button);
    screenshot('settings-backup');
  });
  await test('backup save picker suggests a backup filename and cancels', () =>
    picker('settings.chooseOtherDestination', true));
  await test('default backup open is available', () => findBelow('settings.backupOpenDefault', button));
  await test('backup open picker opens and cancels', () => picker('settings.backupOpenOther'));
} catch (error) {
  failures++;
  console.error(disconnected(error) ? `ABORT Device disconnected: ${serial}` : error.message);
} finally {
  try {
    shell('rm', '-f', dumpPath);
  } catch (error) {
    failures++;
    console.error(`Could not remove the temporary UI dump: ${dumpPath}`);
  }
}
process.exitCode = failures ? 1 : 0;
