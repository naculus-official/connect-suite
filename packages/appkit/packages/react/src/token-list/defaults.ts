/**
 * Default token list sources for React hooks.
 */

import type { TokenListSource } from "@naculus/connect-core";
import {
  ETHEREUM_MAINNET_TOKENS,
  POLYGON_TOKENS,
  OPTIMISM_TOKENS,
  ARBITRUM_TOKENS,
  BASE_TOKENS,
} from "@naculus/connect-core";

/**
 * Get default sources for useTokenList / useTokenSearch hooks.
 * Includes built-in tokens and remote source URLs.
 */
export function getDefaultSources(): TokenListSource[] {
  return [
    {
      name: "built-in",
      tokens: [
        ...ETHEREUM_MAINNET_TOKENS,
        ...POLYGON_TOKENS,
        ...OPTIMISM_TOKENS,
        ...ARBITRUM_TOKENS,
        ...BASE_TOKENS,
      ],
      enabled: true,
    },
    {
      name: "uniswap-default",
      url: "https://tokens.uniswap.org",
      enabled: true,
      refreshInterval: 24 * 60 * 60 * 1000,
    },
  ];
}
