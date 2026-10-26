import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A structural guard against the silent mainnet assumption returning.
 *
 * Seven call sites resolved a chain as `x ?? y ?? "eip155:1"` or `?? 1`. Two of
 * them fed the `Chain ID:` field of a CAIP-122 message, so the user signed an
 * assertion about a chain they were not on; one re-keyed every account in a
 * session to mainnet CAIP-10 and persisted it; three simulated a transaction
 * against a chain it would never be sent to.
 *
 * A unit test per hook would not have caught the class — the pattern is what
 * matters, and it spread by copy. This asserts the shape is gone.
 */

const HOOKS = dirname(fileURLToPath(import.meta.url)).replace(
  /\/core$/,
  "/hooks",
);
const PROVIDER = dirname(fileURLToPath(import.meta.url)).replace(
  /\/core$/,
  "/provider",
);

/** `?? "eip155:1"` or `?? 1` used as a fallback, ignoring comments. */
const MAINNET_FALLBACK = /\?\?\s*(?:"eip155:1"|'eip155:1'|1\s*[;,)])/;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const FILES = [
  join(HOOKS, "useSIWxLogin.ts"),
  join(HOOKS, "useSignInWithX.ts"),
  join(HOOKS, "useTransactionSimulation.ts"),
  join(HOOKS, "useSimulateTransfer.ts"),
  join(HOOKS, "useERC20TransferSimulation.ts"),
  join(HOOKS, "useSmartAccount.ts"),
  join(HOOKS, "useSendUserOperation.ts"),
  join(PROVIDER, "Web3ConnectProvider.tsx"),
];

describe("no silent mainnet fallback", () => {
  it.each(FILES)("%s does not fall back to chain 1", async (file) => {
    const source = stripComments(await readFile(file, "utf8"));
    expect(source).not.toMatch(MAINNET_FALLBACK);
  });

  it("the guard would catch a reintroduction", () => {
    // Guarding the guard: a regex that matches nothing proves nothing.
    expect(stripComments('const c = a ?? b ?? "eip155:1";')).toMatch(
      MAINNET_FALLBACK,
    );
    expect(stripComments("const c = a ?? b ?? 1;")).toMatch(MAINNET_FALLBACK);
    expect(stripComments('// const c = a ?? "eip155:1";')).not.toMatch(
      MAINNET_FALLBACK,
    );
  });
});
