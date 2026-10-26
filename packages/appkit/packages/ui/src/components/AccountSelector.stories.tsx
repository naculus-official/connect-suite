import type { Meta, StoryObj } from "@storybook/react";
import { AccountSelectorView } from "./AccountSelector";

const meta: Meta<typeof AccountSelectorView> = {
  title: "Embedded Wallet/AccountSelector",
  component: AccountSelectorView,
  tags: ["autodocs"],
  args: {
    setActiveNamespace: () => {},
    backfillAccounts: async () => [],
  },
};
export default meta;
type Story = StoryObj<typeof meta>;

const EVM = {
  namespace: "eip155" as const,
  privateKey: `0x${"ef".repeat(32)}`,
  address: "0x9858EfFD232B4033E47d90003D41EC34EcaEda94",
  derivationPath: "m/44'/60'/0'/0/0",
};
const SOL = {
  namespace: "solana" as const,
  privateKey: `0x${"ab".repeat(32)}`,
  address: "HAgk14CToKGpm4rGCyVc5J8mQCGGvaJfYSxUJZ8AXfBW",
  derivationPath: "m/44'/501'/0'/0'",
};

/** One phrase, two independent keys. */
export const BothAccounts: Story = {
  args: { accounts: [EVM, SOL], activeNamespace: "eip155", canDerive: false },
};

export const SolanaActive: Story = {
  args: { accounts: [EVM, SOL], activeNamespace: "solana", canDerive: false },
};

/** An older record that predates multi-namespace support. The phrase already
 *  owns the Solana account; it is simply not listed yet. */
export const CanDeriveMore: Story = {
  args: { accounts: [EVM], activeNamespace: "eip155", canDerive: true },
};

/** Imported from a raw private key. A key is on exactly one curve, so there
 *  is no second account to offer. */
export const RawKeyImport: Story = {
  args: { accounts: [SOL], activeNamespace: "solana", canDerive: false },
};

/** A switch the wallet cannot honour has to say so. */
export const RefusedSwitch: Story = {
  args: {
    accounts: [EVM, SOL],
    activeNamespace: "eip155",
    canDerive: false,
    setActiveNamespace: () => {
      throw new Error("This wallet holds no solana account.");
    },
  },
};
