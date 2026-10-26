import {
  bareEvmAddress,
  tokenChainMismatch,
} from "@naculus/connect-appkit-core";
import type { TokenConfig } from "@naculus/connect-core";
import { type ERC20_MIN_ABI, WalletError } from "@naculus/connect-core";

export interface ERC20Reader {
  readContract(args: {
    address: `0x${string}`;
    abi: typeof ERC20_MIN_ABI;
    functionName: "decimals" | "allowance";
    args?: readonly [`0x${string}`, `0x${string}`];
  }): Promise<unknown>;
}

export interface ERC20Transaction {
  to: `0x${string}`;
  data: `0x${string}`;
  value: "0";
}

export type ERC20Sender = (
  transaction: ERC20Transaction,
) => Promise<`0x${string}`>;

export function assertErc20Context(
  token: TokenConfig,
  chainId: number | undefined,
  account: string | null | undefined,
  connected: boolean,
): `0x${string}` {
  if (!connected || !account) {
    throw new WalletError("wallet_unavailable", "No connected account");
  }
  const mismatch = tokenChainMismatch(token, chainId);
  if (mismatch) throw mismatch;
  const bare = bareEvmAddress(account);
  if (!bare) {
    throw new WalletError("wallet_unavailable", "No valid EVM account");
  }
  return bare;
}
