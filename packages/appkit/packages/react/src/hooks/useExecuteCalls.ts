import {
  type AtomicityRequirement,
  type BatchCall,
  type ExecutionPlan,
  planExecution,
  WalletError,
} from "@naculus/connect-core";
import { useDelegation } from "./useDelegation";
import { useCallback, useState } from "react";
import { useCapabilities } from "./useCapabilities";
import { useSendCalls } from "./useSendCalls";

/** Which executor actually runs the calls. */
export type ExecutionRoute = "wallet-batch" | "user-operation" | "sequential";

export interface ExecutionPreview extends ExecutionPlan {
  route: ExecutionRoute | null;
}

export interface UseExecuteCallsOptions {
  /** Default requirement for `execute`. Per-call override is also accepted. */
  atomicity?: AtomicityRequirement;
  /**
   * Whether gas must be covered by a paymaster.
   *
   * A separate axis from atomicity: it answers who pays, not whether the calls
   * land together, and either can end in a refusal on its own. A route that
   * executes perfectly but charges a user who was promised sponsored gas is
   * still the wrong route, and signing is too late to find out.
   */
  sponsorship?: AtomicityRequirement;
  /**
   * ERC-7677 service passed to `wallet_sendCalls` when the wallet advertises
   * paymaster support. Advertising support alone does not sponsor a call: the
   * service URL (and optional context) is the executable configuration.
   */
  paymasterService?: {
    url: string;
    context?: Record<string, unknown>;
  };
  /**
   * A smart-account executor, typically `sendUserOp` from
   * `useSendUserOperation`.
   *
   * A UserOperation carries its calls in one on-chain execution, so it is
   * atomic by construction. Supplying this gives a wallet that cannot batch a
   * route that still satisfies `"required"` instead of a refusal.
   */
  userOperation?: (calls: BatchCall[]) => Promise<string>;
  /** Whether the supplied UserOperation executor is configured to sponsor gas. */
  userOperationSponsored?: boolean;
}

export interface UseExecuteCallsReturn {
  /**
   * What would happen for this many calls, without sending anything.
   *
   * This is the query EIP-5792 exists for. An application can show "these two
   * will land together" or "these will be sent one by one" before the user
   * commits, rather than discovering it from a half-executed batch.
   */
  preview: (
    callCount: number,
    atomicity?: AtomicityRequirement,
  ) => ExecutionPreview;
  execute: (
    calls: BatchCall[],
    atomicity?: AtomicityRequirement,
  ) => Promise<string>;
  isExecuting: boolean;
  error: Error | null;
  /** The route the last `execute` took. */
  lastRoute: ExecutionRoute | null;
  reset: () => void;
}

/**
 * Route a set of calls to whichever executor can honour the caller's
 * atomicity requirement — and refuse when none can.
 *
 * `useSendCalls` already picks between an EIP-5792 batch and a sequential
 * fallback, but it picks silently and always sends something. A caller that
 * batched an approve with the swap it pays for cannot tell the difference
 * between "these landed together" and "the approve landed and the swap did
 * not", which is the outcome that leaves an approval standing to a contract
 * the user never transacted with.
 */
export function useExecuteCalls(
  options: UseExecuteCallsOptions = {},
): UseExecuteCallsReturn {
  const { current, atomic } = useCapabilities();
  const { delegated, delegate } = useDelegation();
  const { sendCalls } = useSendCalls();
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastRoute, setLastRoute] = useState<ExecutionRoute | null>(null);

  const defaultAtomicity = options.atomicity ?? "preferred";
  const defaultSponsorship = options.sponsorship ?? "any";
  const paymasterService = options.paymasterService;
  const userOperation = options.userOperation;
  const userOperationSponsored = options.userOperationSponsored ?? false;
  const walletPaymasterAvailable = Boolean(
    current?.raw?.paymasterService?.supported && paymasterService,
  );

  const preview = useCallback(
    (callCount: number, atomicity = defaultAtomicity): ExecutionPreview => {
      const plan = planExecution(
        {
          atomicBatch: atomic === "supported",
          // "The wallet said no" and "the wallet has no way to say" are
          // different facts, and the planner treats them differently.
          discovered: atomic !== "unknown",
          // ERC-7677 explicitly says an app MUST NOT assume the paymaster it
          // supplies is ultimately used. A supported capability plus a URL is
          // therefore a requestable route, not proof that the user will not
          // pay. Only an app-controlled sponsored executor can satisfy the
          // strict preflight guarantee.
          sponsoredTransactions: false,
          ...(current?.maxBatchSize === undefined
            ? {}
            : { maxBatchSize: current.maxBatchSize }),
        },
        callCount,
        { atomicity, sponsorship: defaultSponsorship },
      );

      // Capability advertising plus a paymaster URL is only a request for
      // sponsorship; EIP-7677 does not guarantee who ultimately paid. Keep a
      // strict sponsorship requirement fail-closed unless the app controls a
      // sponsored UserOperation route.
      const sponsorshipRefused =
        defaultSponsorship === "required" && !userOperationSponsored;
      if (plan.strategy === "atomic-batch" && !sponsorshipRefused) {
        return {
          ...plan,
          reason:
            plan.reason +
            (walletPaymasterAvailable
              ? " A paymaster service will be requested, but the wallet's final fee payer must be checked after execution."
              : ""),
          route: "wallet-batch",
        };
      }
      // Delegation is evidence about the account, not about the wallet's RPC
      // surface, so it never upgrades a capability — a delegated EOA behind a
      // wallet that does not expose wallet_sendCalls still cannot be asked to
      // batch. It is said out loud because it is the difference between "this
      // cannot work" and "this wallet has not wired it up".
      const delegationNote =
        delegated && atomic !== "supported"
          ? ` This account does delegate to ${delegate} under EIP-7702, so it is capable of batching even though the wallet has not offered to.`
          : "";
      // A UserOperation executes its calls in one transaction, so it rescues
      // both a refusal and a non-atomic fallback the caller did not want.
      const needsUserOperation =
        (atomicity !== "any" && !plan.atomic) ||
        defaultSponsorship === "required";
      if (userOperation && needsUserOperation && !sponsorshipRefused) {
        return {
          strategy: "atomic-batch",
          atomic: true,
          sponsored: userOperationSponsored,
          reason:
            defaultSponsorship === "required" && !plan.sponsored
              ? "The wallet batch is not configured for sponsored gas, so the calls are executed through the configured sponsored UserOperation route."
              : "This wallet cannot batch, so the calls are executed as a single UserOperation through the smart account, which lands as one transaction.",
          route: "user-operation",
        };
      }
      if (sponsorshipRefused) {
        return {
          strategy: "refuse",
          atomic: plan.atomic,
          sponsored: false,
          reason:
            "Sponsored gas was required, but there is no executable sponsored route: no paymaster is configured for a wallet batch, and capability advertising alone cannot pay for a sequential transaction.",
          route: null,
        };
      }
      if (plan.strategy === "refuse") {
        return { ...plan, reason: plan.reason + delegationNote, route: null };
      }
      return {
        ...plan,
        reason: plan.reason + delegationNote,
        route: "sequential",
      };
    },
    [
      atomic,
      current,
      walletPaymasterAvailable,
      userOperation,
      userOperationSponsored,
      defaultAtomicity,
      defaultSponsorship,
      delegated,
      delegate,
    ],
  );

  const execute = useCallback(
    async (calls: BatchCall[], atomicity = defaultAtomicity) => {
      setIsExecuting(true);
      setError(null);
      try {
        const chosen = preview(calls.length, atomicity);
        if (chosen.route === null) {
          // Refused before anything is sent. The alternative is a partial
          // execution the caller explicitly said it could not accept.
          throw new WalletError("method_not_allowed", chosen.reason);
        }
        setLastRoute(chosen.route);

        if (chosen.route === "user-operation") {
          return await userOperation!(calls);
        }
        return await sendCalls(calls, {
          strategy:
            chosen.route === "wallet-batch" ? "atomic-batch" : "sequential",
          ...(chosen.route === "wallet-batch" && walletPaymasterAvailable
            ? { paymasterService }
            : {}),
        });
      } catch (err) {
        const e = err instanceof Error ? err : new Error("Execution failed");
        setError(e);
        throw e;
      } finally {
        setIsExecuting(false);
      }
    },
    [
      preview,
      sendCalls,
      userOperation,
      defaultAtomicity,
      paymasterService,
      walletPaymasterAvailable,
    ],
  );

  return {
    preview,
    execute,
    isExecuting,
    error,
    lastRoute,
    reset: () => {
      setError(null);
      setLastRoute(null);
    },
  };
}
