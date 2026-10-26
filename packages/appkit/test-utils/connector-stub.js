// Storybook stub — connector-evm-injected
// In Storybook (story-only mode) we don't need real wallet connectors.
// The components that use EIP6963 types handle the import gracefully
// when the connector returns empty data.

export const eip6963Connector = {
  name: "eip6963",
  discover: async () => [],
  getWalletState: () => null,
}

export const EIP6963ProviderInfo = {}
export const EIP6963Provider = {}
export const DiscoveredWallet = {}
export const EIP6963Session = {}
