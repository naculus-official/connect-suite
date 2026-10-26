#!/usr/bin/env node
/**
 * Release preflight — refuse to publish appkit from an incoherent state.
 *
 *   node scripts/release-preflight.mjs --pre-bump          # cheap, offline
 *   node scripts/release-preflight.mjs --expect <version>  # packs, hits npm
 *
 * connect-lib has had one of these for a while. appkit did not, and its
 * publish workflow is `pnpm -r publish` against whatever versions happen to be
 * in package.json — so nothing stood between a mistake and npm.
 *
 * The specific failure this exists to stop already nearly happened.
 * `@naculus/connect-appkit-wc` appeared in zero changesets while `react` and
 * `vue` both depend on it with `workspace:*`. `pnpm pack` rewrites that into
 * an exact version, so bumping react and leaving wc behind publishes a react
 * that pins the *previous* release's web components. Nothing would have
 * reported it; the packages install and the wrong ones load.
 *
 * There is no override flag, for the same reason connect-lib's has none: a
 * failure here means the release is not safe, and an escape hatch is reached
 * for at exactly the wrong moment.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Git tag prefix for this group, so lib and appkit can release the same version. */
const TAG_PREFIX = "appkit/v";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE_SPEC = "workspace:*";
const ALLOWED_SPECS = new Set([WORKSPACE_SPEC, "workspace:^"]);
const INTERNAL = /^@naculus\/connect-appkit-/;
const DEP_FIELDS = ["dependencies", "peerDependencies", "optionalDependencies"];

const failures = [];
let checksRun = 0;

function report(label, ok, okDetail, problems = []) {
  checksRun += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label.padEnd(24)} ${ok ? okDetail : problems[0] ?? ""}`);
  if (!ok) {
    failures.push(label);
    for (const line of problems.slice(1)) console.log(`          ${line}`);
  }
}

/** Every publishable package. A private one is not part of a release. */
function readManifests() {
  const out = [];
  for (const entry of readdirSync(join(ROOT, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(ROOT, "packages", entry.name);
    const file = join(dir, "package.json");
    if (!existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    if (manifest.private === true) continue;
    out.push({ dir, manifest });
  }
  return out.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

function checkVersions(manifests, expected) {
  const wrong = manifests
    .filter(({ manifest }) => manifest.version !== expected)
    .map(({ manifest }) => `${manifest.name} is ${manifest.version}, expected ${expected}`);
  report(
    "version consistency",
    wrong.length === 0,
    `${manifests.length} package(s) at ${expected}`,
    wrong.length
      ? [
          `${wrong.length} package(s) out of step`,
          ...wrong,
          "These release together: a partial set publishes packages that pin each other's old copies.",
        ]
      : [],
  );
  return wrong.length === 0;
}

function checkInternalSpecs(manifests) {
  const wrong = [];
  let checked = 0;
  for (const { manifest } of manifests) {
    for (const field of DEP_FIELDS) {
      for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
        if (!INTERNAL.test(name)) continue;
        checked += 1;
        // peerDependencies name a supported range rather than resolving one,
        // so a semver range there is correct and workspace:* would be wrong.
        const expectSpec = field === "peerDependencies" ? null : WORKSPACE_SPEC;
        if (expectSpec && !ALLOWED_SPECS.has(spec)) {
          wrong.push(`${manifest.name} ${field}.${name} is "${spec}", expected "${expectSpec}"`);
        }
      }
    }
  }
  report(
    "internal dep protocol",
    wrong.length === 0,
    `${checked} internal specifier(s) checked`,
    wrong.length ? [`${wrong.length} hard-coded internal specifier(s)`, ...wrong] : [],
  );
}

/**
 * Every publishable package must be in the changeset `fixed` group.
 *
 * This is the check that would have caught wc. A package outside the group
 * bumps on its own schedule, and a package in no changeset at all does not
 * bump — while its siblings pin it by exact version.
 */
function checkChangesetLockstep(manifests) {
  const configPath = join(ROOT, ".changeset", "config.json");
  if (!existsSync(configPath)) {
    report("changeset lockstep", false, "", ["no .changeset/config.json"]);
    return;
  }
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const groups = config.fixed ?? [];
  const grouped = new Set(groups.flat());
  const missing = manifests
    .map(({ manifest }) => manifest.name)
    .filter((name) => !grouped.has(name));
  report(
    "changeset lockstep",
    missing.length === 0,
    `${grouped.size} package(s) in one fixed group`,
    missing.length
      ? [
          `${missing.length} publishable package(s) outside the fixed group`,
          ...missing,
          "changeset version would bump these independently, so a sibling pins a stale copy.",
        ]
      : [],
  );
}

/** A spec that resolves to somewhere on this disk rather than to a registry. */
function localSpec(spec) {
  return /^(link|file|portal):/.test(spec) || /^[./]/.test(spec);
}

/**
 * Nothing in this workspace may resolve to a path on the developer's machine.
 *
 * `pnpm-workspace.yaml` currently carries an `overrides` block pointing every
 * `@naculus/*` package at `link:../connect-lib/packages/*`, because appkit
 * depends on connect-lib by semver range and that version is not published yet.
 * On this machine the sibling checkout exists and everything works. On a runner
 * it does not, and pnpm links to the missing path without complaining — install
 * goes green and the build then fails with `TS2307: Cannot find module
 * '@naculus/connect-core'`, which says nothing about the actual cause.
 *
 * That is the state this repository was in when its first CI publish dry run
 * was attempted. The block is scaffolding with a defined end: it comes out once
 * connect-lib is on the registry at the range appkit asks for. Until then a
 * release cannot be built from a clean clone, so it cannot be released.
 */
function checkWorkspaceWiring(manifests) {
  const problems = [];

  const wsPath = join(ROOT, "pnpm-workspace.yaml");
  if (existsSync(wsPath)) {
    const lines = readFileSync(wsPath, "utf8").split("\n");
    let inOverrides = false;
    for (const line of lines) {
      if (/^overrides:\s*$/.test(line)) {
        inOverrides = true;
        continue;
      }
      // The block ends at the next line that starts in column zero.
      if (inOverrides && line.trim() !== "" && !/^\s/.test(line)) inOverrides = false;
      if (!inOverrides) continue;
      const m = line.match(/^\s+['"]?([^'":]+)['"]?\s*:\s*['"]?([^'"]+)['"]?\s*$/);
      if (m && localSpec(m[2].trim())) {
        problems.push(`pnpm-workspace.yaml overrides.${m[1]} -> ${m[2].trim()}`);
      }
    }
  }

  for (const { manifest } of manifests) {
    for (const field of DEP_FIELDS) {
      for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
        if (localSpec(spec)) problems.push(`${manifest.name} ${field}.${name} -> ${spec}`);
      }
    }
  }

  report(
    "workspace wiring",
    problems.length === 0,
    "nothing resolves to a path outside this repository",
    problems.length
      ? [
          `${problems.length} specifier(s) resolve to a local path`,
          ...problems,
          "A clean clone has no such path. pnpm links to it anyway, so install stays green and",
          "the build fails later with an error that names the module rather than the wiring.",
        ]
      : [],
  );
}

function readPackedVersion(tgz) {
  const listing = execFileSync("tar", ["-xzOf", tgz, "package/package.json"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(listing);
}

/**
 * Pack for real and read what came out.
 *
 * The manifest on disk says `workspace:*`; the tarball says a number. Only the
 * tarball is what a consumer installs, so only the tarball settles whether the
 * pins are right.
 */
function checkPacked(manifests, expected) {
  const tmp = mkdtempSync(join(tmpdir(), "appkit-preflight-"));
  const problems = [];
  try {
    for (const { dir, manifest } of manifests) {
      try {
        execFileSync("pnpm", ["pack", "--pack-destination", tmp], {
          cwd: dir,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (err) {
        const output = `${err?.stdout ?? ""}\n${err?.stderr ?? ""}`;
        problems.push(
          `${manifest.name}: pack failed${
            output.includes("CANNOT_RESOLVE_WORKSPACE_PROTOCOL")
              ? " — run pnpm install first, pnpm cannot resolve workspace:* otherwise"
              : ""
          }`,
        );
        continue;
      }
      const tgz = readdirSync(tmp)
        .filter((f) => f.endsWith(".tgz"))
        .map((f) => join(tmp, f))
        .sort()
        .pop();
      if (!tgz) {
        problems.push(`${manifest.name}: pack produced no tarball`);
        continue;
      }
      const packed = readPackedVersion(tgz);
      if (packed.version !== expected) {
        problems.push(`${manifest.name}: tarball is ${packed.version}, expected ${expected}`);
      }
      for (const field of ["dependencies", "optionalDependencies"]) {
        for (const [name, spec] of Object.entries(packed[field] ?? {})) {
          if (!INTERNAL.test(name)) continue;
          if (spec !== expected) {
            problems.push(
              `${manifest.name}: ${field}.${name} pinned to ${spec}, expected ${expected}`,
            );
          }
        }
      }
      rmSync(tgz, { force: true });
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  report(
    "packed manifests",
    problems.length === 0,
    `${manifests.length} tarball(s): version and internal pins all ${expected}`,
    problems,
  );
}

async function isPublished(name, version) {
  const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`registry answered ${res.status} for ${name}`);
  const body = await res.json();
  return Boolean(body?.versions?.[version]);
}

async function checkRegistry(manifests, expected) {
  let states;
  try {
    states = await Promise.all(
      manifests.map(async ({ manifest }) => ({
        name: manifest.name,
        published: await isPublished(manifest.name, expected),
      })),
    );
  } catch (err) {
    // An unknown registry state is not a safe one.
    report("registry immutability", false, "", [
      String(err?.message ?? err),
      "Could not establish whether this version is already published.",
    ]);
    return;
  }
  const taken = states.filter((s) => s.published).map((s) => `${s.name}@${expected} already exists`);
  report(
    "registry immutability",
    taken.length === 0,
    `0/${states.length} already published at ${expected}`,
    taken.length ? [`${taken.length} package(s) already published`, ...taken] : [],
  );
}

function checkTag(expected) {
  let exists = false;
  try {
    execFileSync("git", ["rev-parse", "--verify", `refs/tags/${TAG_PREFIX}${expected}`], {
      cwd: ROOT,
      stdio: "ignore",
    });
    exists = true;
  } catch {
    exists = false;
  }
  report("tag coherence", !exists, `${TAG_PREFIX}${expected} does not exist yet`, [
    `${TAG_PREFIX}${expected} already exists, so this version was already cut`,
  ]);
}

async function main(argv) {
  const preBump = argv.includes("--pre-bump");
  const i = argv.indexOf("--expect");
  const expected = i === -1 ? null : argv[i + 1];
  if (!preBump && !expected) {
    console.error("usage: release-preflight.mjs (--pre-bump | --expect <version>)");
    process.exit(2);
  }

  const manifests = readManifests();

  // Cheap, offline, no side effects. Everything here is answerable from files
  // already in the checkout, which is why it is worth running before the build
  // rather than after it: a release blocked by any of these is blocked whatever
  // the build does, and finding out first turns a confusing compile error into
  // a sentence about the release.
  if (preBump) {
    console.log("\nappkit release-preflight --pre-bump\n");
    const single = new Set(manifests.map((m) => m.manifest.version));
    checkVersions(manifests, single.size === 1 ? [...single][0] : "(mixed)");
    checkInternalSpecs(manifests);
    checkChangesetLockstep(manifests);
    checkWorkspaceWiring(manifests);
  } else {
    console.log(`\nappkit release-preflight --expect ${expected}\n`);
    const consistent = checkVersions(manifests, expected);
    checkInternalSpecs(manifests);
    checkChangesetLockstep(manifests);
    checkWorkspaceWiring(manifests);
    // Packing a mixed set only reports noise derived from the first failure.
    if (consistent) checkPacked(manifests, expected);
    await checkRegistry(manifests, expected);
    checkTag(expected);
  }

  console.log();
  if (failures.length) {
    console.log(
      `  BLOCKED — ${failures.length}/${checksRun} check(s) failed: ${failures.join(", ")}\n`,
    );
    process.exit(1);
  }
  console.log(`  ${checksRun}/${checksRun} checks passed\n`);
}

await main(process.argv.slice(2));
