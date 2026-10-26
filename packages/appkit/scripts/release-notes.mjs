#!/usr/bin/env node
/**
 * Release notes for one version, from the per-package CHANGELOG.md files
 * that `changeset version` writes.
 *
 *   node scripts/release-notes.mjs <version>
 *
 * Changesets copies one changeset into every package it names, so the same
 * entry appears several times. This lists each change once, with the
 * packages it touched, then a "Version bump only" list of the publishable
 * packages whose section holds no change of their own (only "Updated
 * dependencies", or "No changes in this release."). All packages release
 * in lockstep, so those still get a new version and the notes say so.
 *
 * Fails (exit 1) when a publishable package has no `## <version>` section
 * (`changeset version` was not run for it) or no package has a change: the
 * Publish workflow runs this before anything reaches npm, including on a
 * dry run.
 *
 * The Publish workflow passes the output to `gh release create
 * --notes-file`, ahead of GitHub's generated PR list.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The body of `## <version>`, or null when the heading is absent. */
export function extractSection(changelog, version) {
  const lines = changelog.split("\n");
  const heading = new RegExp(`^## ${escapeRegExp(version)}(\\s|$)`);
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) return null;
  let end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  if (end === -1) end = lines.length;
  return lines
    .slice(start + 1, end)
    .join("\n")
    .trim();
}

/**
 * The entries a section lists as its own changes, keyed by commit (or by
 * text when changesets had no commit). "Updated dependencies" blocks are
 * dependency bumps, not changes of this package.
 */
export function ownEntries(section) {
  const entries = [];
  for (const block of section.split(/^- /m).slice(1)) {
    const text = block
      .split("\n")
      .filter((line) => !/^#{3,} /.test(line))
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ");
    if (/^Updated dependencies\b/.test(text)) continue;
    if (/^@naculus\/\S+@\S+$/.test(text)) continue;
    const match = /^([0-9a-f]{7,40}): (.*)$/s.exec(text);
    entries.push(
      match ? { key: match[1], text: match[2] } : { key: text, text },
    );
  }
  return entries;
}

/** `[{ name, changelog }]` for each publishable package under `packages/`. */
export function readPackages(root) {
  const packages = [];
  for (const dir of readdirSync(join(root, "packages")).sort()) {
    const manifestPath = join(root, "packages", dir, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.private) continue;
    const changelogPath = join(root, "packages", dir, "CHANGELOG.md");
    packages.push({
      name: manifest.name,
      changelog: existsSync(changelogPath)
        ? readFileSync(changelogPath, "utf8")
        : "",
    });
  }
  return packages;
}

export function releaseNotes(packages, version) {
  const missing = [];
  const changes = new Map();
  const bumpOnly = [];
  for (const { name, changelog } of packages) {
    const section = extractSection(changelog, version);
    if (section === null) {
      missing.push(name);
      continue;
    }
    const entries = ownEntries(section);
    if (entries.length === 0) bumpOnly.push(name);
    for (const { key, text } of entries) {
      const change = changes.get(key) ?? { text, packages: [] };
      change.packages.push(name);
      changes.set(key, change);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `No "## ${version}" section in the CHANGELOG of ${missing.join(", ")}; run \`pnpm changeset version\` before releasing.`,
    );
  }
  if (changes.size === 0) {
    throw new Error(
      `No package lists a change for ${version}; add a changeset before releasing.`,
    );
  }
  const lines = ["### Changes", ""];
  for (const [key, change] of changes) {
    const commit = /^[0-9a-f]{7,40}$/.test(key) ? ` (${key})` : "";
    lines.push(
      `- ${change.text}${commit}`,
      `  — ${change.packages.map((name) => `\`${name}\``).join(", ")}`,
    );
  }
  if (bumpOnly.length > 0) {
    lines.push(
      "",
      "### Version bump only",
      "",
      ...bumpOnly.map((name) => `- \`${name}\``),
    );
  }
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = process.argv[2];
  if (!version) {
    console.error("usage: node scripts/release-notes.mjs <version>");
    process.exit(2);
  }
  const root = fileURLToPath(new URL("..", import.meta.url));
  try {
    process.stdout.write(releaseNotes(readPackages(root), version));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
