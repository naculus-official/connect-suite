import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveSiwxChainId, runSiwxFlow } from "./siwx-flow";

/**
 * SIWx decides who the session belongs to, so the failure modes matter as much
 * as the happy path: an unparseable message must be refused *before* the user
 * is asked to sign, and a failure under `required: true` must be reported as
 * fatal so the binding tears the connection down instead of leaving a
 * half-authenticated session.
 */

const ADDR = "0x1234567890abcdef1234567890abcdef12345678";

const session = (ns: Record<string, unknown>) =>
  ({ namespaces: ns }) as never;

const evmSession = session({
  eip155: { chains: ["eip155:1"], accounts: [`eip155:1:${ADDR}`] },
});

const validMessage =
  `localhost wants you to sign in with your Ethereum account:\n${ADDR}\n\n` +
  "URI: https://test.com\nVersion: 1\nChain ID: eip155:1\n" +
  "Nonce: testnonce123\nIssued At: 2026-08-26T00:00:00.000Z";

describe("core boundary", () => {
  it("does not import a UI framework", () => {
    const source = readFileSync(join(__dirname, "siwx-flow.ts"), "utf8");
    for (const f of ["react", "vue", "svelte", "solid-js"]) {
      expect(source).not.toMatch(new RegExp(`from ["']${f}(/|["'])`));
    }
  });
});

describe("resolveSiwxChainId", () => {
  it.each([
    [{ eip155: { chains: ["eip155:137"] } }, "eip155:137"],
    [{ solana: { chains: ["solana:abc"] } }, "solana:abc"],
    [{ xrpl: { chains: ["xrpl:0"] } }, "xrpl:0"],
    [{}, "eip155:1"],
  ])("resolves %o", (ns, expected) => {
    expect(resolveSiwxChainId(session(ns))).toBe(expected);
  });

  it("prefers eip155 in a fixed order, not object key order", () => {
    // Key enumeration order is not a contract; the precedence must be explicit.
    const mixed = session({
      xrpl: { chains: ["xrpl:0"] },
      eip155: { chains: ["eip155:1"] },
    });
    expect(resolveSiwxChainId(mixed)).toBe("eip155:1");
  });
});

describe("runSiwxFlow", () => {
  const handlers = (over = {}) => ({
    createMessage: vi.fn(async () => validMessage),
    handleSignComplete: vi.fn(async () => {}),
    ...over,
  });

  it("skips when SIWx is not configured", async () => {
    const r = await runSiwxFlow({
      session: evmSession,
      siwx: undefined,
      signMessage: vi.fn(),
    });
    expect(r).toEqual({ kind: "skipped" });
  });

  it("skips when there is no session", async () => {
    const r = await runSiwxFlow({
      session: null,
      siwx: handlers(),
      signMessage: vi.fn(),
    });
    expect(r).toEqual({ kind: "skipped" });
  });

  it("signs and reports the authenticated identity", async () => {
    const signMessage = vi.fn(async () => "0xsig");
    const h = handlers();
    const r = await runSiwxFlow({ session: evmSession, siwx: h, signMessage });
    expect(r).toEqual({ kind: "authenticated", address: ADDR, chainId: "eip155:1" });
    expect(h.handleSignComplete).toHaveBeenCalledWith({
      message: validMessage,
      signature: "0xsig",
    });
  });

  it("refuses an unparseable message before asking for a signature", async () => {
    const signMessage = vi.fn(async () => "0xsig");
    const r = await runSiwxFlow({
      session: evmSession,
      siwx: handlers({ createMessage: vi.fn(async () => "not a siwx message") }),
      signMessage,
    });
    expect(r).toMatchObject({ kind: "failed", fatal: true });
    expect(signMessage).not.toHaveBeenCalled();
  });

  it("fails when the session has no account in the chain's namespace", async () => {
    const r = await runSiwxFlow({
      session: session({ eip155: { chains: ["eip155:1"], accounts: [] } }),
      siwx: handlers(),
      signMessage: vi.fn(),
    });
    expect(r).toMatchObject({ kind: "failed", fatal: true });
  });

  it("marks a rejection non-fatal when SIWx is optional", async () => {
    const r = await runSiwxFlow({
      session: evmSession,
      siwx: handlers({ required: false }),
      signMessage: vi.fn(async () => Promise.reject(new Error("User rejected"))),
    });
    expect(r).toMatchObject({ kind: "failed", fatal: false });
  });

  it("marks a rejection fatal by default", async () => {
    const r = await runSiwxFlow({
      session: evmSession,
      siwx: handlers(),
      signMessage: vi.fn(async () => Promise.reject(new Error("User rejected"))),
    });
    expect(r).toMatchObject({ kind: "failed", fatal: true });
    expect((r as { error: Error }).error.message).toMatch(/User rejected/);
  });
});
