// Trusted runner parent: target receives no runner credentials or Docker socket.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';

const root = process.cwd();
const base = path.join(root, '.mpp-isolated');
const tools = path.join(root, 'sources/naculus-locale-frontend-tester/release-gate/isolated-mpp');
const image = JSON.parse(fs.readFileSync(base + '/image.json')).image;
if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw Error('Invalid pinned image');
const id = 'mpp-gate-' + crypto.randomUUID();
const scratch = base + '/' + id;
fs.mkdirSync(scratch);
const sudo = args => execFileSync('sudo', args, { stdio: 'inherit', timeout: 30000 });
let mounted = false;
let active;
const env = ['PATH=/opt/tools/node_modules/.bin:/usr/local/bin:/usr/bin:/bin', 'HOME=/scratch/home', 'TMPDIR=/scratch/tmp', 'XDG_CACHE_HOME=/scratch/cache', 'XDG_CONFIG_HOME=/scratch/config', 'LANG=C.UTF-8', 'TZ=UTC', 'CI=1', 'NODE_ENV=test', 'NODE_OPTIONS=--max-old-space-size=768', 'PNPM_HOME=/scratch/pnpm', 'PLAYWRIGHT_BROWSERS_PATH=/ms-playwright', 'pnpm_config_offline=true', 'pnpm_config_ignore_scripts=true', 'pnpm_config_store_dir=/scratch/store', 'pnpm_config_update_notifier=false', 'pnpm_config_fund=false', 'pnpm_config_audit=false', 'pnpm_config_verify_deps_before_run=false', 'pnpm_config_workspace_concurrency=1'];
const terminate = () => { if (active) try { execFileSync('docker', ['kill', active], { stdio: 'ignore', timeout: 10000 }); } catch {} };
for (const s of ['SIGINT', 'SIGTERM']) process.once(s, () => { terminate(); process.exitCode = 130; });
async function run(mode) {
  active = id + '-' + mode;
  const file = mode === 'probe' ? 'probe.mjs' : 'target.mjs';
  const args = ['run', '--rm', '--init', '--name', active, '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '1000:1000', '--cpus', '2', '--memory', '5g', '--memory-swap', '5g', '--pids-limit', '192', '--ulimit', 'cpu=600:600', '--ulimit', 'fsize=134217728:134217728', '--ulimit', 'nofile=1024:1024', '--log-driver', 'none', '--tmpfs', '/dev/shm:ro,nosuid,nodev,noexec,size=1m', '--mount', `type=bind,source=${scratch}/mount,target=/scratch`, '--mount', `type=bind,source=${base}/inputs,target=/inputs,readonly`, '--mount', `type=bind,source=${base}/prepared,target=/prepared,readonly`, '--mount', `type=bind,source=${tools}/${file},target=/helper.mjs,readonly`, '--entrypoint', '/usr/bin/env', image, '-i', ...env, 'node', '/helper.mjs', mode];
  const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let bytes = 0, timeout = false, overflow = false;
  const timer = setTimeout(() => { timeout = true; terminate(); }, mode === 'probe' ? 60000 : 1200000);
  for (const [stream, sink] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) stream.on('data', data => { bytes += data.length; if (bytes > 4 * 1024 ** 2) { overflow = true; terminate(); } else sink.write(data); });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  clearTimeout(timer);
  console.log(JSON.stringify({ mode, code, timeout, overflow }));
  if (code !== 0 || timeout || overflow) throw Error('Isolated stage failed: ' + mode);
  active = undefined;
}
try {
  execFileSync('truncate', ['-s', String(6 * 1024 ** 3), scratch + '/disk.img']);
  execFileSync('mkfs.ext4', ['-q', '-F', '-m', '0', scratch + '/disk.img']);
  fs.mkdirSync(scratch + '/mount');
  sudo(['mount', '-o', 'loop,nosuid,nodev', scratch + '/disk.img', scratch + '/mount']); mounted = true;
  sudo(['chown', '1000:1000', scratch + '/mount']); sudo(['chmod', '700', scratch + '/mount']);
  await run('probe');
  await run('gate');
} finally {
  terminate();
  for (const mode of ['probe', 'gate']) {
    try { execFileSync('docker', ['rm', '-f', id + '-' + mode], { stdio: 'ignore', timeout: 10000 }); } catch {}
    if (execFileSync('docker', ['ps', '-aq', '--filter', 'name=^/' + id + '-' + mode + '$'], { encoding: 'utf8' }).trim()) throw Error('Container cleanup unconfirmed');
  }
  if (mounted) sudo(['umount', scratch + '/mount']);
  if (fs.existsSync(scratch + '/disk.img')) fs.unlinkSync(scratch + '/disk.img');
  if (fs.existsSync(scratch + '/mount')) fs.rmdirSync(scratch + '/mount');
  fs.rmdirSync(scratch);
  console.log('DISPOSABLE TARGET CLEANUP VERIFIED');
}
