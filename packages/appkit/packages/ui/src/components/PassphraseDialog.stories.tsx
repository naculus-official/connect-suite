import type { Meta, StoryObj } from "@storybook/react";
import { PassphraseDialogView } from "./PassphraseDialog";

const meta: Meta<typeof PassphraseDialogView> = {
  title: "Embedded Wallet/PassphraseDialog",
  component: PassphraseDialogView,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: { submit: () => {}, cancel: () => {} },
};
export default meta;
type Story = StoryObj<typeof meta>;

/** Opening a wallet that already exists. One field, no confirmation. */
export const Unlock: Story = {
  args: { request: { intent: "unlock", previousError: null } },
};

/**
 * After a failed decrypt. Without the explanation the dialog simply reappears,
 * which reads as a bug and gets the same value retyped.
 */
export const UnlockRetry: Story = {
  args: {
    request: {
      intent: "unlock",
      previousError: "That passphrase did not open the wallet.",
    },
  },
};

/**
 * Setting one for the first time. The warning is here rather than in a
 * document because this is the moment the decision is made.
 */
export const Create: Story = {
  args: { request: { intent: "create", previousError: null } },
};

/** Nothing is waiting on an answer. */
export const Idle: Story = { args: { request: null } };
