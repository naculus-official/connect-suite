import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const allow = ['PATH', 'HOME', 'TMPDIR', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'LANG', 'TZ', 'CI', 'NODE_ENV', 'NODE_OPTIONS', 'PNPM_HOME', 'PLAYWRIGHT_BROWSERS_PATH', 'pnpm_config_offline', 'pnpm_config_ignore_scripts', 'pnpm_config_store_dir', 'pnpm_config_update_notifier', 'pnpm_config_fund', 'pnpm_config_audit', 'pnpm_config_verify_deps_before_run', 'pnpm_config_workspace_concurrency'];
assert.deepEqual(Object.keys(process.env).sort(), allow.sort());
assert.equal(process.getuid(), 1000);
for (const [file, value] of [['memory.max', String(5 * 1024 ** 3)], ['memory.swap.max', '0'], ['pids.max', '192'], ['cpu.max', '200000 100000']]) assert.equal(fs.readFileSync('/sys/fs/cgroup/' + file, 'utf8').trim(), value);
assert.deepEqual(fs.readdirSync('/sys/class/net'), ['lo']);
const status = fs.readFileSync('/proc/self/status', 'utf8');
assert.match(status, /NoNewPrivs:\s+1/); assert.match(status, /CapEff:\s+0+/);
for (const p of ['/inputs/write-probe', '/prepared/write-probe', '/usr/local/bin/write-probe', '/ms-playwright/write-probe', '/dev/shm/write-probe']) assert.throws(() => fs.writeFileSync(p, 'blocked'), e => ['EROFS', 'EACCES'].includes(e.code));
assert.equal(fs.existsSync('/var/run/docker.sock'), false);
const mount = fs.readFileSync('/proc/mounts', 'utf8').split('\n').find(l => l.split(' ')[1] === '/scratch').split(' ');
assert.equal(mount[2], 'ext4'); assert.ok(mount[3].split(',').includes('nosuid')); assert.ok(mount[3].split(',').includes('nodev'));
const stats = fs.statfsSync('/scratch'); assert.ok(stats.blocks * stats.bsize <= 6 * 1024 ** 3);
for (const d of ['home', 'tmp']) fs.mkdirSync('/scratch/' + d, { recursive: true });
for (const [key, value] of [['offline', 'true'], ['ignore-scripts', 'true'], ['store-dir', '/scratch/store'], ['workspace-concurrency', '1']]) {
  const r = spawnSync('pnpm', ['config', 'get', key], { cwd: '/scratch', encoding: 'utf8', env: process.env });
  assert.equal(r.status, 0); assert.equal(r.stdout.trim(), value);
}
const { chromium } = await import('/opt/tools/node_modules/playwright-core/index.mjs');
const browser = await chromium.launch();
try { const page = await browser.newPage(); await page.setContent('<title>dummy containment probe</title>'); assert.equal(await page.title(), 'dummy containment probe'); }
finally { await browser.close(); }
console.log('CONTAINMENT PROBE PASS; no SDK imported');
