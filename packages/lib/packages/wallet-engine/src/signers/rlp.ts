/**
 * Re-exported from @naculus/connect-core/signing, where the RLP primitives now
 * live. The worker is bundled with that subpath inlined (see
 * tsup.worker.config.ts), so importing from here costs it nothing at runtime.
 */
export {
  encodeRlpList,
  hexToBytes,
  toRlpBytes,
  toRlpQuantity,
} from "@naculus/connect-core/signing";
