// Trusted helper. Cache mode reads only lockfile data, never target modules.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

function command(args, cwd) {
  const r = spawnSync('pnpm', args, { cwd, env: process.env, stdio: 'inherit' });
  if (r.error || r.status !== 0) throw r.error ?? Error('pnpm command failed: ' + args.join(' ') + ', exit=' + r.status);
}

if (process.argv[2] === 'cache') {
  const { parse, stringify } = await import('/opt/tools/node_modules/yaml/dist/index.js');
  const versions = new Map();
  // pnpm resolves platform-specific optional packages from full metadata
  // (abbreviated documents omit `libc`); offline, a missing full document
  // silently drops every binding of the parent package.
  const optionalNames = new Set();
  // The gate's `pnpm install --force` installs optional packages for every
  // platform, so the offline store needs every locked platform's tarball.
  const platforms = { os: new Set(), cpu: new Set(), libc: new Set() };
  for (const file of fs.readdirSync('/locks')) {
    if (!/^[a-z-]+\.yaml$/.test(file)) throw Error('Invalid lock name');
    for (const entry of Object.values(parse(fs.readFileSync('/locks/' + file, 'utf8')).packages ?? {})) {
      for (const field of Object.keys(platforms)) for (const value of entry[field] ?? []) if (!value.startsWith('!')) platforms[field].add(value);
    }
  }
  const supported = stringify({ supportedArchitectures: Object.fromEntries(Object.entries(platforms).map(([field, values]) => [field, [...values].sort()])) });
  for (const file of fs.readdirSync('/locks')) {
    if (!/^[a-z-]+\.yaml$/.test(file)) throw Error('Invalid lock name');
    const lock = parse(fs.readFileSync('/locks/' + file, 'utf8'));
    // Fetch external locked payloads only; SDK tarballs will be built offline.
    for (const section of ['packages', 'snapshots']) {
      for (const key of Object.keys(lock[section] ?? {})) {
        if (key.startsWith('@naculus/')) { delete lock[section][key]; continue; }
        const m = key.match(/^((?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)@(\d[^()]*)/i);
        if (!m) throw Error('Non-registry lock entry: ' + key);
        if (!versions.has(m[1])) versions.set(m[1], new Set());
        versions.get(m[1]).add(m[2]);
        for (const name of Object.keys(lock[section][key].optionalDependencies ?? {})) if (!name.startsWith('@naculus/')) optionalNames.add(name);
        for (const group of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
          for (const name of Object.keys(lock[section][key][group] ?? {})) if (name.startsWith('@naculus/')) delete lock[section][key][group][name];
        }
        const resolution = lock[section][key].resolution;
        if (resolution?.tarball && new URL(resolution.tarball).hostname !== 'registry.npmjs.org') throw Error('Non-public-registry tarball');
      }
    }
    // fetch walks importer reachability: empty importers silently fetch nothing.
    // Preserve every external locked entry, excluding only locally built SDKs.
    for (const importer of Object.values(lock.importers ?? {})) {
      for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
        for (const [name, entry] of Object.entries(importer[group] ?? {})) {
          if (name.startsWith('@naculus/') || /^(link:|file:|workspace:)/.test(entry.version)) delete importer[group][name];
        }
      }
    }
    delete lock.overrides;
    delete lock.patchedDependencies;
    const directory = '/prepared/fetch/' + file.slice(0, -5);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(directory + '/pnpm-lock.yaml', stringify(lock));
    fs.writeFileSync(directory + '/package.json', '{"private":true}');
    fs.writeFileSync(directory + '/pnpm-workspace.yaml', supported);
    command(['fetch', '--ignore-scripts', '--store-dir', '/prepared/store'], directory);
  }
  // fetch can omit optional native payloads. Preseed the exact locked browser
  // tool binding as a preparation-only tool; never add it to the consumer.
  if (!versions.get('@rolldown/binding-linux-arm64-gnu')?.has('1.2.4')) throw Error('Unexpected rolldown binding version');
  fs.mkdirSync('/prepared/native');
  fs.writeFileSync('/prepared/native/package.json', '{"private":true}');
  command(['add', '--ignore-scripts', '--save-exact', '--store-dir', '/prepared/store', '@rolldown/binding-linux-arm64-gnu@1.2.4'], '/prepared/native');
  // Fresh tarball range resolution needs metadata as well as locked payloads.
  let total = 0;
  const documents = [...versions].map(([name, selected]) => ({ name, selected, full: false }));
  for (const name of optionalNames) if (versions.has(name)) documents.push({ name, selected: versions.get(name), full: true });
  for (const { name, selected, full } of documents) {
    const url = 'https://registry.npmjs.org/' + name.replace('/', '%2f');
    const r = await fetch(url, { headers: { Accept: full ? 'application/json' : 'application/vnd.npm.install-v1+json' }, redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw Error('Registry metadata failed: ' + name);
    const chunks = []; let bytes = 0;
    for await (const chunk of r.body) { bytes += chunk.length; if (bytes > 64 * 1024 ** 2) throw Error('Metadata response limit'); chunks.push(chunk); }
    const metadata = JSON.parse(Buffer.concat(chunks).toString());
    metadata.versions = Object.fromEntries(Object.entries(metadata.versions).filter(([v]) => selected.has(v)));
    metadata['dist-tags'] = Object.fromEntries(Object.entries(metadata['dist-tags'] ?? {}).filter(([, v]) => metadata.versions[v]));
    if (Object.keys(metadata.versions).length !== selected.size) throw Error('Missing locked metadata: ' + name);
    if (full && metadata.time) metadata.time = Object.fromEntries(Object.entries(metadata.time).filter(([v]) => selected.has(v) || v === 'created' || v === 'modified'));
    const output = JSON.stringify({ etag: r.headers.get('etag'), modified: r.headers.get('last-modified') }) + '\n' + JSON.stringify(metadata) + '\n';
    total += Buffer.byteLength(output); if (total > 128 * 1024 ** 2) throw Error('Metadata total limit');
    const file = '/prepared/cache/pnpm/v11/' + (full ? 'metadata-full' : 'metadata') + '/registry.npmjs.org/' + name + '.jsonl';
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, output);
  }
  console.log('CACHE PLATFORMS ' + supported.replaceAll('\n', ' '));
  console.log('CACHE READY ' + versions.size + ' public names (' + optionalNames.size + ' optional with full metadata); selected locked versions only');
} else if (process.argv[2] === 'gate') {
  const manifest = JSON.parse(fs.readFileSync('/inputs/manifest.json'));
  for (const [relative, expected] of Object.entries(manifest.hashes)) {
    if (relative.startsWith('/') || relative.split('/').includes('..')) throw Error('Invalid snapshot path');
    if (crypto.createHash('sha256').update(fs.readFileSync('/inputs/' + relative)).digest('hex') !== expected) throw Error('Input hash drift');
  }
  for (const d of ['home', 'tmp', 'cache', 'store', 'workspace']) fs.mkdirSync('/scratch/' + d, { recursive: true });
  for (const repo of Object.keys(manifest.refs)) fs.cpSync('/inputs/' + repo, '/scratch/workspace/' + repo, { recursive: true });
  fs.cpSync('/prepared/store', '/scratch/store', { recursive: true });
  fs.cpSync('/prepared/cache', '/scratch/cache', { recursive: true });
  const wcPath = '/scratch/workspace/connect-appkit/packages/wc/package.json';
  const wc = JSON.parse(fs.readFileSync(wcPath));
  if (wc.scripts.build !== 'stencil build --docs') throw Error('Unexpected WC script');
  wc.scripts.build += ' --max-workers=0';
  fs.writeFileSync(wcPath, JSON.stringify(wc, null, 2) + '\n');
  console.log('DISPOSABLE WC WORKER OVERRIDE; original source hashes above');
  command(['install', '--offline', '--ignore-scripts', '--frozen-lockfile', '--store-dir', '/scratch/store'], '/scratch/workspace/connect-lib');
  try { command(['gate'], '/scratch/workspace/naculus-locale-frontend-tester'); }
  catch (error) {
    // Diagnostic only: replay the gate's offline install and print why pnpm
    // skipped optional native bindings. The gate itself is unchanged.
    const tester = '/scratch/workspace/naculus-locale-frontend-tester';
    const pnpmDir = tester + '/node_modules/.pnpm';
    const installed = fs.existsSync(pnpmDir) ? fs.readdirSync(pnpmDir).filter(name => name.includes('rolldown')) : [];
    console.log('DIAGNOSTIC installed rolldown entries: ' + JSON.stringify(installed));
    const lock = fs.existsSync(tester + '/pnpm-lock.yaml') ? fs.readFileSync(tester + '/pnpm-lock.yaml', 'utf8') : '';
    const at = lock.lastIndexOf('\n  rolldown@1.2.4:');
    console.log('DIAGNOSTIC lock snapshot: ' + (at < 0 ? 'missing' : JSON.stringify(lock.slice(at, at + 900))));
    const report = process.report.getReport().header;
    console.log('DIAGNOSTIC libc: ' + JSON.stringify({ glibcRuntime: report.glibcVersionRuntime, ldd: fs.existsSync('/usr/bin/ldd') ? fs.readFileSync('/usr/bin/ldd', 'utf8').slice(0, 200).includes('GNU') : 'missing', arch: process.arch }));
    const r = spawnSync('pnpm', ['install', '--force', '--offline', '--reporter=ndjson'], { cwd: tester, env: process.env, encoding: 'utf8', maxBuffer: 64 * 1024 ** 2 });
    const lines = (r.stdout ?? '').split('\n').filter(line => line.includes('rolldown') || line.includes('skipped-optional'));
    console.log('DIAGNOSTIC replay events (' + lines.length + ' lines, exit ' + r.status + ')');
    for (const line of lines.slice(0, 60)) console.log(line.slice(0, 500));
    throw error;
  }
  finally { console.log('MEMORY EVENTS ' + fs.readFileSync('/sys/fs/cgroup/memory.events', 'utf8').replaceAll('\n', '; ')); }
} else throw Error('Unknown helper mode');
