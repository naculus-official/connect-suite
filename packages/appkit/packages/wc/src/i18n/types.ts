export interface TranslationKeys {
  connect: {
    connectWallet: string
    disconnect: string
    connecting: string
    switchNetwork: string
    copyAddress: string
    viewExplorer: string
  }
  wallet: {
    noWallet: string
    installWallet: string
    refreshList: string
    eip6963Wallets: string
    walletConnectWallets: string
  }
  account: {
    balance: string
    address: string
    chain: string
    signIn: string
    signOut: string
  }
  network: {
    unsupported: string
    switchTo: string
  }
  a11y: {
    closeDialog: string
    openMenu: string
    loading: string
    success: string
    error: string
  }
}

export type Locale = "en" | "zh-TW"
