// Trusted CI preparation: no SDK import/build and no inherited credentials.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const base = path.join(root, '.mpp-isolated');
if (process.platform !== 'linux' || process.arch !== 'arm64') throw Error('Linux arm64 runner required');
if (Number(fs.readFileSync('/proc/meminfo', 'utf8').match(/MemTotal:\s+(\d+)/)[1]) < 7 * 1024 ** 2) throw Error('Runner RAM below7GiB');
const disk = fs.statfsSync(root);
if (disk.bavail * disk.bsize < 12 * 1024 ** 3) throw Error('Runner needs12GiB free disk');
fs.mkdirSync(base); // Never reuse a previous preparation.
fs.mkdirSync(base + '/inputs');
const hashes = {};
const refs = {};
const repos = ['connect-lib', 'connect-appkit', 'naculus-locale-frontend-tester'];
for (const repo of repos) {
  const source = path.join(root, 'sources', repo);
  refs[repo] = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const tracked = execFileSync('git', ['-C', source, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const relative of tracked) {
    if (relative.split('/').some(p => p.startsWith('.env') || ['.git', '.npmrc', '.pnpmfile.cjs'].includes(p))) continue;
    const input = path.resolve(source, relative);
    if (!fs.realpathSync(input).startsWith(source + '/') || !fs.lstatSync(input).isFile()) throw Error('Unsafe input');
    const data = fs.readFileSync(input);
    const output = base + '/inputs/' + repo + '/' + relative;
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, data, { mode: fs.statSync(input).mode & 0o777, flag: 'wx' });
    hashes[repo + '/' + relative] = crypto.createHash('sha256').update(data).digest('hex');
  }
}
for (const [file, hash] of Object.entries({
  'session.ts': 'afa17017c243fa62ba83aa6f8ac15ae93b3981be35e12fc90e3bd15900f15e22',
  'session.test.ts': '37e01a29d35838b04c398cc57c89fcfa09bce194fe23b52733c863264280ba68',
})) {
  if (hashes['connect-lib/packages/payments-mpp/src/' + file] !== hash) throw Error('Reviewed MPP source drift');
}
fs.writeFileSync(base + '/inputs/manifest.json', JSON.stringify({ refs, hashes }));
console.log('INPUT REFS ' + JSON.stringify(refs));
console.log('INPUT HASHES ' + JSON.stringify(hashes));
const tools = path.join(root, 'sources/naculus-locale-frontend-tester/release-gate/isolated-mpp');
fs.writeFileSync(base + '/Dockerfile', `FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS node\nFROM mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e\nCOPY --from=node /usr/local/bin/node /usr/local/bin/node\nCOPY --from=node /usr/local/lib/node_modules/npm /opt/npm\nRUN node /opt/npm/bin/npm-cli.js install --prefix /opt/tools --ignore-scripts --no-audit --no-fund --save-exact pnpm@11.1.2 yaml@2.8.1 playwright-core@1.62.1\nENTRYPOINT ["/usr/bin/env"]\n`);
const docker = (args, options = {}) => execFileSync('docker', args, { stdio: 'inherit', timeout: 600000, ...options });
docker(['build', '--tag', 'mpp-gate-tools:local', base]);
const image = execFileSync('docker', ['image', 'inspect', '--format', '{{.Id}}', 'mpp-gate-tools:local'], { encoding: 'utf8' }).trim();
if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw Error('Unpinned image');
fs.writeFileSync(base + '/image.json', JSON.stringify({ image }));
fs.mkdirSync(base + '/prepared');
// The image's non-root preparation user must own its only writable bind.
execFileSync('sudo', ['chown', '1000:1000', base + '/prepared']);
// Only lockfile data and trusted helper enter network-enabled preparation.
// No source tree, lifecycle scripts, GitHub token or runner environment.
fs.mkdirSync(base + '/locks');
for (const repo of repos) fs.copyFileSync(base + '/inputs/' + repo + '/pnpm-lock.yaml', base + '/locks/' + repo + '.yaml');
docker(['run', '--rm', '--name', 'mpp-cache-preparation', '--user', '1000:1000', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--cpus', '2', '--memory', '2g', '--memory-swap', '2g', '--pids-limit', '128', '--ulimit', 'fsize=134217728:134217728', '--mount', `type=bind,source=${base}/locks,target=/locks,readonly`, '--mount', `type=bind,source=${tools}/target.mjs,target=/helper.mjs,readonly`, '--mount', `type=bind,source=${base}/prepared,target=/prepared`, '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=64m', '--entrypoint', '/usr/bin/env', image, '-i', 'PATH=/opt/tools/node_modules/.bin:/usr/local/bin:/usr/bin:/bin', 'HOME=/prepared/home', 'XDG_CACHE_HOME=/prepared/cache', 'TMPDIR=/tmp', 'pnpm_config_ignore_scripts=true', 'pnpm_config_auto_install_peers=false', 'node', '/helper.mjs', 'cache']);
// Root-owned payload is readonly in the target; source caches are never shared.
execFileSync('sudo', ['chmod', '-R', 'a+rX', base + '/prepared']);
console.log('PREPARATION COMPLETE; all target execution remains pending');
