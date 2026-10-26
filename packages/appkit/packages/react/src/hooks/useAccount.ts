import { isEvmAddress, parseCaip10 } from "@naculus/connect-core";
import { useMemo } from "react";
import { useWeb3 } from "../provider/Web3ConnectProvider";

export interface AccountEntry {
  /** As the session reports it: CAIP-10 for most wallets, bare hex for some. */
  address: string;
  /** The namespace, when the entry was CAIP-10. Null for a bare address. */
  namespace: string | null;
  isEVM: boolean;
}

/**
 * The connected accounts, split by what they actually are.
 *
 * Reads the namespace from the CAIP-10 form rather than inferring it from
 * address shape wherever it can, and falls back to shape only for a bare
 * address. A bare 0x-40-hex value is unambiguously EVM; a bare base58 string
 * is not unambiguously anything.
 */
export function useAccount() {
  const { accounts, isConnected } = useWeb3();

  const accountData = useMemo<AccountEntry[] | null>(() => {
    if (!isConnected || accounts.length === 0) return null;

    return accounts.map((address) => {
      const parsed = parseCaip10(address);
      if (parsed) {
        return {
          address,
          namespace: parsed.namespace,
          // The namespace decides, not the shape. A wallet that reports
          // `solana:...:0x...` is telling us something about the account that
          // its characters do not.
          isEVM: parsed.namespace === "eip155" && isEvmAddress(parsed.address),
        };
      }
      return {
        address,
        namespace: null,
        isEVM: isEvmAddress(address),
      };
    });
  }, [accounts, isConnected]);

  const evmAccount = accountData?.find((a) => a.isEVM)?.address ?? null;

  return {
    accounts: accountData,
    evmAccount,
    primaryAccount: accounts[0] ?? null,
    isConnected,
    count: accounts.length,
  };
}
