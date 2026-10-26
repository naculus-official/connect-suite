/**
 * Chain Logos Registry
 *
 * Inline SVG icons (mini 24×24) for supported chains.
 * Inline strings rather than asset files: tsup bundles inline SVG strings,
 * but not external asset files.
 *
 * Sources:
 * - https://cryptologos.cc — Ethereum, Polygon, BNB, Arbitrum, Avalanche, Fantom
 * - https://github.com/trustwallet/assets — Optimism
 */

// ── Chain SVG Icons (compact, viewBox-preserved) ──────────────────

const ETH_LOGO = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 0l-.26.97v28.15l.26.26 13.07-7.72L12 0z" fill="#8C8C8C"/><path d="M12 0L-.87 21.69l12.87 7.72V0z" fill="#3C3C3B"/><path d="M12 31.88l-.16.2v10.55l.16.47 13.08-18.42L12 31.88z" fill="#8C8C8C"/><path d="M12 42.9V31.88L-.87 24.68 12 42.9z" fill="#3C3C3B"/><path d="M12 28.41l13.07-7.72L12 14.09v14.32z" fill="#141414"/><path d="M-.87 20.69L12 28.41V14.09l-12.87 6.6z" fill="#393939"/></svg>`

const POLYGON_LOGO = `<svg viewBox="0 0 24 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 12.3l-3.7 2.2-3.8-2.2V7.9L11.3 5.7 15 7.9v2.7l-2.2 1.3-1.5-.9v-2l1.5.9 2.2-1.3V7.9L11.3 4 6 7.9v6.3l5.3 3.1 5.3-3.1-1.6-2.8z" fill="#6C00F6"/></svg>`

const BSC_LOGO = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="12" fill="#F0B90B"/><path d="M12 4l2.7 1.6L14.7 7 12 5.4 9.3 7l-.7-.4L12 4zm4.7 2.7l-2.7 1.6V10l4 2.3v4.7L16 18.7v-4l-1.3-.7v4L12 20l-2.7-1.6v-4L8 14.7v4l-1.3-.7V12.3l4-2.3V8.3l-2.7-1.6.7-.4L12 8l2.7-1.7.7.4z" fill="white"/></svg>`

const ARBITRUM_LOGO = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 1.5c.3 0 .6.1.8.2l8.8 5.1c.5.3.9.9.9 1.5v10.2c0 .6-.3 1.2-.9 1.5l-8.8 5.1c-.3.2-.6.2-.8.2s-.6-.1-.8-.2l-8.8-5.1c-.5-.3-.9-.9-.9-1.5V8.3c0-.6.3-1.2.9-1.5l8.8-5.1c.3-.2.6-.2.8-.2z" fill="#213147"/><path d="M14.7 13.8l-1.2 3.2c0 .1 0 .2.1.3l2 5.5 2.3-1.3-2.8-7.6c-.1-.2-.3-.2-.4-.1z" fill="#12AAFF"/><path d="M16.3 8.5c0-.2-.3-.2-.4 0l-1.1 3.2c0 .1 0 .2.1.3l3.3 9 2.3-1.3-4.2-9.1v-.1z" fill="#12AAFF"/><path d="M12 3.5c.1 0 .2 0 .3.1l8.8 5.1c.1.1.2.2.2.3v10.2c0 .1-.1.2-.2.3l-8.8 5.1c-.1 0-.2.1-.3.1s-.2 0-.3-.1l-8.8-5.1c-.1-.1-.2-.2-.2-.3V9c0-.1.1-.2.2-.3l8.8-5.1c.1 0 .2-.1.3-.1z" fill="#9DCCED" fill-opacity="0.3"/><path d="M13.3 6.2h-2.2c-.2 0-.3.1-.4.3L5.9 19.6l2.3 1.3L13 6.5c0-.1-.1-.3-.2-.3h.4z" fill="white"/><path d="M15.2 6.2H13c-.2 0-.3.1-.4.3L8.1 21.4l2.3 1.3 6-16.4c0-.1-.1-.3-.2-.3v.2z" fill="white"/></svg>`

const OPTIMISM_LOGO = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="12" fill="#FF0420"/><path d="M8.5 16c-.5 0-.9-.1-1.3-.3-.4-.2-.7-.5-1-.8-.3-.4-.4-.8-.4-1.3V10c0-.5.1-1 .4-1.4.3-.4.6-.7 1-.9.4-.2.8-.3 1.3-.3.4 0 .8.1 1.2.2.3.2.6.4.8.7l-1 1c-.2-.2-.4-.3-.6-.4-.2-.1-.5-.2-.8-.2-.3 0-.6.1-.9.2-.3.2-.5.4-.6.7-.1.3-.2.6-.2 1v3.5c0 .3.1.6.2.9.1.3.3.5.6.6.3.2.6.2.9.2.3 0 .6-.1.8-.2.2-.1.4-.3.6-.5l1 1c-.2.3-.5.5-.8.7-.4.2-.9.3-1.4.3z" fill="white"/><path d="M15.5 16c-.5 0-.9-.1-1.3-.3-.4-.2-.7-.5-1-.8-.2-.4-.4-.8-.4-1.3V10c0-.5.1-1 .4-1.4.2-.4.5-.7.9-.9.4-.2.8-.3 1.3-.3.5 0 1 .1 1.4.3.4.2.7.5.9.9.2.4.3.9.3 1.4v.7h-2.9v-1.1c0-.3-.1-.6-.2-.9-.1-.3-.3-.5-.5-.6-.2-.1-.5-.2-.8-.2-.3 0-.6.1-.8.2-.3.2-.5.4-.6.7-.1.3-.2.6-.2 1v3.5c0 .3.1.6.2.8.1.3.3.5.6.6.2.2.5.2.8.2.3 0 .6-.1.8-.2.2-.1.4-.3.5-.6.1-.3.2-.6.2-1v-1.1h2.9v.7c0 .5-.1 1-.3 1.4-.2.4-.5.7-.9.9-.4.2-.9.3-1.4.3z" fill="white"/></svg>`

const AVALANCHE_LOGO = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="12" fill="#E84142"/><path d="M8.6 16.8H6.3c-.5 0-.8-.1-1-.3-.2-.2-.3-.5-.3-.8 0-.2 0-.4.1-.6l5.8-10.7c.2-.4.5-.7.8-.8.3-.1.5-.1.7 0 .2.1.5.3.7.8l1.2 2.1.1.2c.3.5.5.9.5 1.3.1.4.1.8 0 1.1-.1.4-.3.8-.6 1.3l-3 5.4c-.2.5-.5.8-.8 1-.4.2-.7.2-1.2.2z" fill="white"/><path d="M14.5 16.8h3.3c.5 0 .7-.1 1-.3.2-.2.3-.5.3-.8 0-.2-.1-.4-.3-.7l-1.7-3-.2-.3c-.2-.4-.4-.7-.6-.8-.2-.1-.4-.1-.6 0-.2.1-.4.3-.6.8l-1.6 3c-.2.4-.4.7-.4.9 0 .2.1.5.3.7.1.1.4.3.9.3z" fill="white"/></svg>`

const FANTOM_LOGO = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="12" fill="#1969FF"/><path d="M11.3 3.8c.4-.2 1-.2 1.4 0l4.1 2.2c.2.1.4.3.4.5h0v10.9c0 .2-.1.4-.4.6l-4.1 2.2c-.4.2-1 .2-1.4 0l-4.1-2.2c-.3-.1-.4-.4-.4-.6V6.5c0-.2.1-.4.4-.5l4.1-2.2zm5.3 8.7l-3.9 2c-.4.2-1 .2-1.4 0l-3.9-2v4.8l3.9 2c.2.1.5.2.7.2.2 0 .5-.1.7-.2l3.9-2v-4.8z" fill="white"/></svg>`

// ── Registry ──────────────────────────────────────────────────────

const CHAIN_LOGOS: Record<string, string> = {
  "eip155:1": ETH_LOGO,           // Ethereum
  "eip155:137": POLYGON_LOGO,     // Polygon
  "eip155:56": BSC_LOGO,          // BSC
  "eip155:42161": ARBITRUM_LOGO,  // Arbitrum
  "eip155:10": OPTIMISM_LOGO,     // Optimism
  "eip155:43114": AVALANCHE_LOGO, // Avalanche
  "eip155:250": FANTOM_LOGO,      // Fantom
  "eip155:11155111": ETH_LOGO,    // Sepolia
}

/**
 * Resolve the chain logo for a given chain ID (e.g. "eip155:1").
 * Returns the SVG string, or undefined if unknown.
 */
export function getChainLogo(chainId: string): string | undefined {
  return CHAIN_LOGOS[chainId]
}
