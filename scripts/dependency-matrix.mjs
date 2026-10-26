#!/usr/bin/env node
/**
 * Cross-package dependency matrix.
 *
 * The workspace links packages to each other, so a test run inside the
 * monorepo can pass while a published install fails: a manifest can ask for a
 * range that the workspace never resolves (`^0.13.0` next to a 0.14.x core),
 * and nothing in the workspace build would show it. This script checks the
 * release artifacts instead.
 *
 *   Static  - every @naculus/* range in every publishable manifest must be
 *             satisfied by the lockstep version of its target, and both groups
 *             must be on one version.
 *   Dynamic - each publishable entry package is packed, installed alone into a
 *             clean consumer project with npm (overrides point every
 *             @naculus/* name at the local tarballs, so nothing comes from the
 *             registry), then checked: one copy of every @naculus/* package,
 *             all at the lockstep version, and the entry imports in Node.
 *
 *   node scripts/dependency-matrix.mjs            # static + dynamic
 *   node scripts/dependency-matrix.mjs --static   # static only
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GROUPS = ["packages/lib/packages", "packages/appkit/packages"];
const STATIC_ONLY = process.argv.includes("--static");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Every workspace package in both groups, public or private. */
function workspacePackages() {
  const out = [];
  for (const group of GROUPS) {
    for (const dir of readdirSync(join(ROOT, group))) {
      const pkgDir = join(ROOT, group, dir);
      const manifest = join(pkgDir, "package.json");
      if (!existsSync(manifest)) continue;
      out.push({ dir: join(group, dir), group, json: readJson(manifest) });
    }
  }
  return out;
}

function publishable(pkgs) {
  return pkgs.filter((p) => !p.json.private && p.json.name.startsWith("@naculus/"));
}

function fail(problems) {
  for (const line of problems) console.error(`  ✗ ${line}`);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}

/* ------------------------------------------------------------------ static */

function staticCheck(pkgs) {
  const problems = [];
  const versions = new Map(pkgs.map((p) => [p.json.name, p.json.version]));

  for (const group of GROUPS) {
    const members = pkgs.filter((p) => p.group === group && !p.json.private);
    const distinct = new Set(members.map((p) => p.json.version));
    if (distinct.size > 1) {
      problems.push(`${group} is not on one version: ${[...distinct].join(", ")}`);
    }
  }

  for (const pkg of publishable(pkgs)) {
    const deps = { ...pkg.json.dependencies, ...pkg.json.peerDependencies };
    for (const [name, range] of Object.entries(deps)) {
      if (!name.startsWith("@naculus/")) continue;
      if (range.startsWith("workspace:")) continue;
      const target = versions.get(name);
      if (!target) {
        problems.push(`${pkg.json.name} depends on ${name}, which is not a workspace package`);
        continue;
      }
      if (!semver.satisfies(target, range)) {
        problems.push(`${pkg.json.name} asks for ${name}@${range}; lockstep version is ${target}`);
        continue;
      }
      // A range can be satisfied and still be too loose: ^0.13.0 never matches
      // 0.14.x, but ">=0.13.0" would. Require the floor to sit in the target's
      // release series, so a package cannot silently accept an older series.
      const floor = semver.minVersion(range);
      if (floor.major !== semver.major(target) || floor.minor !== semver.minor(target)) {
        problems.push(`${pkg.json.name} floor ${name}@${range} is outside the ${target} series`);
      }
    }
  }
  return problems;
}

/* ----------------------------------------------------------------- dynamic */

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", ...options });
}

/** Pack each publishable package once; returns name -> tarball path. */
function packAll(pkgs, outDir) {
  const tarballs = new Map();
  for (const pkg of publishable(pkgs)) {
    const before = new Set(readdirSync(outDir));
    run("pnpm", ["pack", "--pack-destination", outDir], { cwd: join(ROOT, pkg.dir) });
    const created = readdirSync(outDir).filter((f) => !before.has(f) && f.endsWith(".tgz"));
    if (created.length !== 1) throw new Error(`pack of ${pkg.json.name} produced ${created.length} tarballs`);
    tarballs.set(pkg.json.name, join(outDir, created[0]));
  }
  return tarballs;
}

/** Each entry is installed alone, so its closure must hold without help. */
function scenarioEntries(pkgs) {
  return publishable(pkgs).map((p) => p.json.name);
}

function installScenario(entry, tarballs, workDir) {
  const consumer = join(workDir, entry.replace(/[@/]/g, "_"));
  mkdirSync(consumer, { recursive: true });
  // The entry is a direct dependency, so an override for it would conflict.
  const overrides = Object.fromEntries(
    [...tarballs].filter(([name]) => name !== entry).map(([name, file]) => [name, `file:${file}`]),
  );
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ name: "consumer", private: true, type: "module", overrides }, null, 2),
  );
  run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", tarballs.get(entry)], { cwd: consumer, stdio: "pipe" });
  return consumer;
}

/** Every @naculus/* copy under node_modules, including nested duplicates. */
function naculusCopies(consumer) {
  const copies = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = join(dir, entry.name);
      if (entry.name === "@naculus") {
        for (const scoped of readdirSync(full)) {
          const manifest = join(full, scoped, "package.json");
          if (existsSync(manifest)) copies.push({ name: `@naculus/${scoped}`, version: readJson(manifest).version, path: join(full, scoped) });
        }
        continue;
      }
      walk(join(full, "node_modules"));
      if (entry.name.startsWith("@")) walk(full);
    }
  };
  walk(join(consumer, "node_modules"));
  return copies;
}

function dynamicCheck(pkgs, tarballs, lockstep) {
  const problems = [];
  const workDir = mkdtempSync(join(tmpdir(), "connect-matrix-"));
  for (const entry of scenarioEntries(pkgs)) {
    let consumer;
    try {
      consumer = installScenario(entry, tarballs, workDir);
    } catch (error) {
      problems.push(`${entry}: install failed\n${String(error.stderr || error.message).split("\n").slice(-6).join("\n")}`);
      continue;
    }

    const copies = naculusCopies(consumer);
    const byName = new Map();
    for (const copy of copies) {
      if (!byName.has(copy.name)) byName.set(copy.name, new Set());
      byName.get(copy.name).add(copy.version);
    }
    for (const [name, versionsSeen] of byName) {
      const expected = lockstep.get(name);
      if (!expected) continue;
      if (versionsSeen.size > 1) problems.push(`${entry}: ${name} installed at several versions: ${[...versionsSeen].join(", ")}`);
      else if (!versionsSeen.has(expected)) problems.push(`${entry}: ${name} is ${[...versionsSeen][0]}, expected ${expected}`);
    }
    const nested = copies.filter((c) => !c.path.startsWith(join(consumer, "node_modules", "@naculus")));
    if (nested.length) problems.push(`${entry}: nested @naculus copies: ${nested.map((c) => `${c.name}@${c.version}`).join(", ")}`);

    try {
      run("node", ["--input-type=module", "-e", `await import(${JSON.stringify(entry)});`], { cwd: consumer, stdio: "pipe" });
      console.log(`  ✓ ${entry} installed and imports`);
    } catch (error) {
      problems.push(`${entry}: import failed\n${String(error.stderr || error.message).split("\n").slice(-6).join("\n")}`);
    }
  }
  return problems;
}

/* -------------------------------------------------------------------- main */

const pkgs = workspacePackages();
const lockstep = new Map(pkgs.map((p) => [p.json.name, p.json.version]));

console.log("Static: manifest ranges and lockstep versions");
const staticProblems = staticCheck(pkgs);
if (staticProblems.length) fail(staticProblems);
console.log(`  ✓ ${publishable(pkgs).length} publishable packages, all ranges match their lockstep target`);

if (STATIC_ONLY) process.exit(0);

console.log("Dynamic: pack, install alone, check, import");
const outDir = mkdtempSync(join(tmpdir(), "connect-tarballs-"));
const tarballs = packAll(pkgs, outDir);
const dynamicProblems = dynamicCheck(pkgs, tarballs, lockstep);
if (dynamicProblems.length) fail(dynamicProblems);
console.log(`  ✓ ${scenarioEntries(pkgs).length} entry packages resolve to one lockstep copy each`);
