// Hermes has no crypto.randomUUID. @mobile-wallet-protocol/client (Coinbase
// MWP) calls it for every request, so without this connecting the Coinbase
// Smart Wallet fails with "undefined is not a function". Built on
// crypto.getRandomValues, which @walletconnect/react-native-compat installs.
const cryptoObject = globalThis.crypto as Crypto & { randomUUID?: () => string };
if (typeof cryptoObject?.randomUUID !== "function") {
  cryptoObject.randomUUID = () => {
    const bytes = cryptoObject.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as ReturnType<Crypto["randomUUID"]>;
  };
}
