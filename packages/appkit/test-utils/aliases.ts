import path from "path";

/** Shared resolve aliases for Storybook + Vitest. Keeps both configs in sync. */
export function getAliases(root: string) {
  const r = (p: string) => path.resolve(root, p);
  const stub = r("test-utils/module-stub.js");

  // connect-lib lives in this monorepo (packages/lib), so tests always run
  // against its current source.
  const lib = (pkg: string) => r(`../lib/packages/${pkg}/src`);

  return {
    "@naculus/connect-appkit-core": r("packages/core/src"),
    "@naculus/connect-appkit-react": r("packages/react/src"),
    "@naculus/connect-appkit-ui": r("packages/ui/src"),
    "@naculus/connect-appkit-wc": r("packages/wc/dist"),
    "@naculus/connect-core": lib("core"),
    "@naculus/connector-evm-injected": lib("connector-evm-injected"),
    "@naculus/wallet-engine": lib("wallet-engine"),
    // Connector packages that are not exercised by a test stay stubbed.
    starknet: stub,
    "@cosmjs/amino": stub,
    "@polkadot/api": stub,
    "@polkadot/keyring": stub,
    "@naculus/connector-solana": stub,
    "@naculus/connector-xrpl": stub,
    "@naculus/connector-coinbase": stub,
    "@naculus/connector-wagmi": stub,
    "@reown/appkit": stub,
  };
}
