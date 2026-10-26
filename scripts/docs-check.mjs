#!/usr/bin/env node
/**
 * Public-docs guard.
 *
 * Two checks over every Markdown, MDX and text file in the repository:
 *
 *   1. Relative links resolve. A moved or deleted file must not leave a
 *      dangling `[text](../path)` behind.
 *   2. No internal terms. Product names, AI-tooling names, and internal
 *      process words must not appear in public docs. Matching is on whole
 *      words, so "framework" does not trip the "work" rule.
 *
 * Internal records belong outside this repository. This script keeps them
 * from coming back; it does not decide what is internal. Add a term to
 * DENYLIST when a new one is found.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "hydrate"]);
const DOC_EXT = /\.(md|mdx|txt)$/i;

// Whole-word, case-insensitive. Keep this list to terms that must never be public.
const DENYLIST = [
  "SenderPay",
  "senderpay",
  "Codex",
  "Claude",
  "daily report",
  "daily-report",
  "daily benchmark",
  "Sluzen",
  "Work package",
  "quota gap",
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (DOC_EXT.test(entry)) yield full;
  }
}

const problems = [];
const LINK = /\]\(([^)\s#]+)(#[^)]*)?\)/g;

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, "utf8");

  for (const match of text.matchAll(LINK)) {
    const target = match[1];
    if (/^(https?:|mailto:)/.test(target)) continue;
    const resolved = normalize(join(dirname(file), target));
    if (!existsSync(resolved)) problems.push(`${rel}: broken link -> ${target}`);
  }

  const lines = text.split("\n");
  lines.forEach((line, i) => {
    for (const term of DENYLIST) {
      const pattern = new RegExp(`(^|[^A-Za-z0-9])${term.replace(/[-\s]/g, "[-\\s]")}([^A-Za-z0-9]|$)`, "i");
      if (pattern.test(line)) problems.push(`${rel}:${i + 1}: internal term "${term}"`);
    }
  });
}

if (problems.length) {
  for (const line of problems) console.error(`  ✗ ${line}`);
  console.error(`\n${problems.length} problem(s) in public docs.`);
  process.exit(1);
}
console.log("Public docs: links resolve and no internal terms found.");
