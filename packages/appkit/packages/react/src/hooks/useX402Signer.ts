import {
  createX402WalletSigner,
  findX402Provider,
  type X402SignerUnavailableReason,
  type X402TypedDataSigner,
} from "@naculus/connect-appkit-core";
import { eip6963Connector } from "@naculus/connector-evm-injected";
import { useMemo } from "react";
import { useWeb3 } from "../provider/Web3ConnectProvider";

export interface UseX402SignerReturn {
  signer: X402TypedDataSigner | null;
  reason: X402SignerUnavailableReason | null;
}

/** Build an x402 signer for the currently connected external EVM wallet. */
export function useX402Signer(): UseX402SignerReturn {
  const { session, accounts, chainId, client, switchChain } = useWeb3();
  const accountKey = accounts.join("\0");

  return useMemo(() => {
    void accountKey;
    void chainId;
    const provider = findX402Provider(session, {
      injected: eip6963Connector.getDiscoveredWallets(),
      walletConnect: client.connector,
    });
    return createX402WalletSigner(session, provider, switchChain);
  }, [session, accountKey, chainId, client.connector, switchChain]);
}
