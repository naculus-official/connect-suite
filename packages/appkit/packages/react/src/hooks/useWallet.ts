import { useWeb3 } from "../provider/Web3ConnectProvider";

export function useWallet() {
  const {
    status,
    session,
    accounts,
    chainId,
    error,
    connect,
    disconnect,
    reconnect,
    switchChain
  } = useWeb3();

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";
  const isReconnecting = status === "reconnecting";

  const currentAccount = accounts[0] ?? null;
  const isDisconnected = status === "disconnected";

  return {
    status,
    session,
    accounts,
    chainId,
    error,
    isConnected,
    isConnecting,
    isReconnecting,
    isDisconnected,
    currentAccount,
    connect,
    disconnect,
    reconnect,
    switchChain
  };
}