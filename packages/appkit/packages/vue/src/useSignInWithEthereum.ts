import type { MaybeRef } from "vue";
import type { SiwxSignInAction, SiwxSignInOptions } from "./siwx";
import { type UseSignInWithXReturn, useSignInWithX } from "./useSignInWithX";

export type UseSignInWithEthereumOptions = SiwxSignInOptions;

export interface UseSignInWithEthereumReturn extends UseSignInWithXReturn {}

/** Ethereum-named view of the caller-owned SIWX sign-in shell. */
export function useSignInWithEthereum(
  action: MaybeRef<SiwxSignInAction>,
): UseSignInWithEthereumReturn {
  return useSignInWithX(action);
}
