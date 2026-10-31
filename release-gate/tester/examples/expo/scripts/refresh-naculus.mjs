// Reinstall the @naculus/* packages from ../../artifacts after `pnpm gate:pack`.
// The tarballs keep their version number between builds, so npm would keep
// serving the locked (cached) contents; drop their lock entries first.
import { execSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
for (const key of Object.keys(lock.packages ?? {})) {
  if (key.includes("node_modules/@naculus/")) delete lock.packages[key];
}
writeFileSync("package-lock.json", `${JSON.stringify(lock, null, 2)}\n`);
rmSync("node_modules/@naculus", { recursive: true, force: true });
execSync("npm cache clean --force && npm install --no-audit --no-fund", {
  stdio: "inherit",
});
