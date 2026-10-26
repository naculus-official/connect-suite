import type { Meta, StoryObj } from "@storybook/react";
import { WalletSecurityPanelView } from "./WalletSecurityPanel";

const meta: Meta<typeof WalletSecurityPanelView> = {
  title: "Embedded Wallet/WalletSecurityPanel",
  component: WalletSecurityPanelView,
  tags: ["autodocs"],
};
export default meta;
type Story = StoryObj<typeof meta>;

const HOT_WALLET = {
  id: "hot-wallet-signing-exposure",
  severity: "info" as const,
  deduction: 0,
  title: "The signing key is in memory while it signs",
  detail:
    "WebCrypto implements neither secp256k1 nor mature Ed25519, so the key cannot be a non-extractable CryptoKey the way the storage key is. This is what a hot wallet is, not a defect in this one.",
  remedy:
    "For amounts where that matters, sign with a hardware wallet.",
};

/** The realistic ceiling, and the reason it is not 100. */
export const BestCase: Story = {
  args: {
    report: {
      level: 1,
      score: 95,
      backend: "indexedDb",
      encrypted: true,
      unlock: { prf: "available", sealedWith: ["prf", "passphrase"] },
      findings: [
        {
          id: "passphrase-recovery-retained",
          severity: "info",
          deduction: 5,
          title: "A passphrase can still open this wallet",
          detail:
            "The stored record carries both a passkey wrap and a passphrase wrap, so it is only as hard to open as the passphrase.",
          remedy:
            "A deliberate trade. Removing the passphrase wrap would recover these points and make a lost passkey cost this copy.",
        },
        HOT_WALLET,
      ],
    },
  },
};

/** A passkey exists but the record on disk predates it. */
export const ResealPending: Story = {
  args: {
    report: {
      level: 1,
      score: 90,
      backend: "indexedDb",
      encrypted: true,
      unlock: { prf: "available", sealedWith: ["passphrase"] },
      findings: [
        {
          id: "prf-reseal-pending",
          severity: "warning",
          deduction: 10,
          title: "Passkey protection is not applied to the stored record yet",
          detail:
            "This device can produce passkey key material, but the record on disk was sealed before that.",
          remedy: "Save the wallet once. The next write seals it with both.",
        },
        HOT_WALLET,
      ],
    },
  },
};

/** Encrypted, but only a passphrase stands behind it. */
export const PassphraseOnly: Story = {
  args: {
    report: {
      level: 1,
      score: 80,
      backend: "indexedDb",
      encrypted: true,
      unlock: { prf: "none", sealedWith: ["passphrase"] },
      findings: [
        {
          id: "prf-not-configured",
          severity: "warning",
          deduction: 20,
          title: "Unlocking needs only a passphrase",
          detail:
            "The encryption key comes from a passphrase this page can supply. Whatever can run script here can supply it too.",
          remedy: "Register a passkey and pass its PRF provider.",
        },
        HOT_WALLET,
      ],
    },
  },
};

/** What a browser without IndexedDB and without encryption looks like. */
export const WorstCase: Story = {
  args: {
    report: {
      level: 4,
      score: 30,
      backend: "localStorage",
      encrypted: false,
      unlock: { prf: "none", sealedWith: null },
      findings: [
        {
          id: "backend-localstorage",
          severity: "critical",
          deduction: 40,
          title: "Stored in localStorage",
          detail:
            "Any script that runs on this origin can read localStorage synchronously.",
          remedy: "Use a browser where IndexedDB is available.",
        },
        {
          id: "no-encryption-at-rest",
          severity: "critical",
          deduction: 30,
          title: "Not encrypted at rest",
          detail: "The wallet is stored as readable JSON.",
          remedy: "Configure encryptionPassphrase.",
        },
        HOT_WALLET,
      ],
    },
  },
};

/** Deductions only. The hot-wallet note is hidden. */
export const DeductionsOnly: Story = {
  args: { ...BestCase.args, hideInformational: true },
};

/** Before a wallet exists there is nothing to assess. */
export const NoWallet: Story = { args: { report: null } };
