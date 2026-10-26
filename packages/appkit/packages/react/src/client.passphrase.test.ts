// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createPocketConnector, passkeys } = vi.hoisted(() => ({
  createPocketConnector: vi.fn((_config?: Record<string, unknown>) => ({
    id: "embedded",
    kind: "embedded",
  })),
  passkeys: {
    hasCredential: vi.fn(() => true),
    derivePrfKey: vi.fn(async () => new Uint8Array(32).fill(3)),
  },
}));

vi.mock("@naculus/connector-embedded", () => ({ createPocketConnector }));
vi.mock("@naculus/connector-passkeys", () => ({
  createPasskeysConnector: () => passkeys,
}));
vi.mock("@naculus/connector-walletconnect", () => ({
  createWalletConnectConnector: () => ({
    id: "walletconnect",
    onAccountsChanged: vi.fn(() => () => {}),
    onChainChanged: vi.fn(() => () => {}),
  }),
}));

import { createClient } from "./client";

const BASE = {
  projectId: "p",
  metadata: { name: "n", description: "d", url: "u", icons: [] },
};

/** The embedded connector is constructed inside a dynamic import. */
async function configPassedToEngine() {
  await new Promise((r) => setTimeout(r, 0));
  return createPocketConnector.mock.calls.at(-1)?.[0];
}

beforeEach(() => vi.clearAllMocks());

describe("createClient — passphrase prompt", () => {
  it("does not create a gate unless asked", async () => {
    const client = createClient({ ...BASE, enableEmbedded: true });
    expect(client.passphraseGate).toBeNull();
    expect((await configPassedToEngine())?.encryptionPassphrase).toBeUndefined();
  });

  it("wires the gate in as the engine's passphrase source", async () => {
    const client = createClient({
      ...BASE,
      enableEmbedded: true,
      passphrasePrompt: true,
    });
    expect(client.passphraseGate).not.toBeNull();
    const cfg = await configPassedToEngine();
    expect(cfg?.encryptionPassphrase).toBe(client.passphraseGate?.request);
  });

  // Supplying your own prompt is a deliberate choice, not something to
  // silently take over.
  it("leaves a caller-supplied callback alone", async () => {
    const mine = async () => "mine";
    const client = createClient({
      ...BASE,
      enableEmbedded: true,
      passphrasePrompt: true,
      embeddedConfig: { encryptionPassphrase: mine },
    });
    expect(client.passphraseGate).toBeNull();
    expect((await configPassedToEngine())?.encryptionPassphrase).toBe(mine);
  });

  it("creates no gate when the embedded wallet is off", () => {
    const client = createClient({ ...BASE, passphrasePrompt: true });
    expect(client.passphraseGate).toBeNull();
  });

  it("does not mutate the caller's config object", async () => {
    const embeddedConfig = {};
    createClient({
      ...BASE,
      enableEmbedded: true,
      passphrasePrompt: true,
      embeddedConfig,
    });
    await configPassedToEngine();
    expect(embeddedConfig).toEqual({});
  });
});

describe("createClient — passkey unlock", () => {
  it("wires PRF automatically when both are enabled", async () => {
    createClient({
      ...BASE,
      enableEmbedded: true,
      enablePasskeys: true,
      passphrasePrompt: true,
    });
    const cfg = await configPassedToEngine();
    expect(cfg?.prfUnlock).toBeDefined();

    const derive = (cfg!.prfUnlock as { derive: (s: Uint8Array) => Promise<unknown> })
      .derive;
    await expect(derive(new Uint8Array(32))).resolves.toEqual(
      new Uint8Array(32).fill(3),
    );
  });

  // There is no key to wrap without encryption, so a PRF provider would ask
  // the user for a fingerprint that protects nothing.
  it("does not wire PRF when nothing is encrypted", async () => {
    createClient({ ...BASE, enableEmbedded: true, enablePasskeys: true });
    expect((await configPassedToEngine())?.prfUnlock).toBeUndefined();
  });

  it("does not wire PRF when passkeys are off", async () => {
    createClient({
      ...BASE,
      enableEmbedded: true,
      passphrasePrompt: true,
    });
    expect((await configPassedToEngine())?.prfUnlock).toBeUndefined();
  });

  it("leaves a caller-supplied provider alone", async () => {
    const mine = { derive: async () => null };
    createClient({
      ...BASE,
      enableEmbedded: true,
      enablePasskeys: true,
      passphrasePrompt: true,
      embeddedConfig: { prfUnlock: mine },
    });
    expect((await configPassedToEngine())?.prfUnlock).toBe(mine);
  });

  // Returning null rather than throwing is what lets the record fall back to
  // passphrase-only instead of failing the save.
  it("returns null when no credential is registered", async () => {
    passkeys.hasCredential.mockReturnValue(false);
    createClient({
      ...BASE,
      enableEmbedded: true,
      enablePasskeys: true,
      passphrasePrompt: true,
    });
    const cfg = await configPassedToEngine();
    const derive = (cfg!.prfUnlock as { derive: (s: Uint8Array) => Promise<unknown> })
      .derive;
    await expect(derive(new Uint8Array(32))).resolves.toBeNull();
  });
});
