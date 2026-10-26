import type { Meta, StoryObj } from "@storybook/react";
import { PasskeySetupView } from "./PasskeySetup";

const meta: Meta<typeof PasskeySetupView> = {
  title: "Embedded Wallet/PasskeySetup",
  component: PasskeySetupView,
  tags: ["autodocs"],
};
export default meta;
type Story = StoryObj<typeof meta>;

const noCredential = {
  hasCredential: () => false,
  createPasskey: async () => ({}),
};
const withCredential = {
  hasCredential: () => true,
  createPasskey: async () => ({}),
};

/** Nothing registered yet. */
export const Offer: Story = {
  args: { passkeys: noCredential, unlock: undefined },
};

/** Registered and applied to the stored record. */
export const Protected: Story = {
  args: {
    passkeys: withCredential,
    unlock: { prf: "available", sealedWith: ["prf", "passphrase"] },
  },
};

/** Registered, but the record on disk still predates it. */
export const ResealPending: Story = {
  args: {
    passkeys: withCredential,
    unlock: { prf: "available", sealedWith: ["passphrase"] },
  },
};

/**
 * The case a generic success message would hide. PRF cannot be added to an
 * existing credential, so this has to say a new one is needed.
 */
export const CannotUnlock: Story = {
  args: {
    passkeys: withCredential,
    unlock: { prf: "unavailable", sealedWith: ["passphrase"] },
  },
};

/** Not yet exercised. Not the same answer as "no". */
export const NotCheckedYet: Story = {
  args: { passkeys: withCredential, unlock: { prf: "unknown", sealedWith: null } },
};

/** Passkeys are not enabled on the client. */
export const Disabled: Story = { args: { passkeys: null, unlock: undefined } };
