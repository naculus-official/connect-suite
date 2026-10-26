import type {
  AtomicityRequirement,
  ExecutionPlan,
  Hex,
  ScopeCheckResult,
  SessionKeyInfo,
  SessionKeyManager,
  SessionKeyScope,
  SessionKeyTransaction,
} from "@naculus/connect-core";
import {
  DELEGATION_FRAMEWORK,
  delegationTypedData,
  WalletError,
} from "@naculus/connect-core";

/**
 * Signed off-chain delegation policies: the complete product flow, shared by
 * React and Vue. Everything that decides whether a policy may be created,
 * is still valid, or may sign or broadcast lives here; the framework shells
 * only add state and wiring.
 *
 * Only `offchain` mode is created. An EIP-7702 or AA-module policy needs a
 * real on-chain executor; accepting those here would turn a local record into
 * a false delegation claim.
 */

// ── Types ─────────────────────────────────────────────────────────

/** What the execution planner says about a batch, plus the route it chose. */
export interface PolicyExecutionPreview extends ExecutionPlan {
  route: string | null;
}

export interface DelegationPolicyPreview {
  policy: SessionKeyInfo | null;
  scope: ScopeCheckResult;
  execution: PolicyExecutionPreview;
  signerMatches: boolean;
  authorizationVerified: boolean;
  ready: boolean;
  broadcastReady: boolean;
  broadcastRoute: PolicyExecutionRoute | null;
  onchainAuthorizationVerified: boolean;
  broadcastSponsored: boolean | null;
  broadcastPromptless: boolean;
  reason: string;
}

export type PolicyExecutionRoute = "erc4337" | "eip7702";

export interface PolicyExecutionCheck {
  ready: boolean;
  authorizationInstalled: boolean;
  sponsored: boolean;
  promptless: boolean;
  executorAddress?: `0x${string}`;
  reason: string;
}

export interface PreparedPolicyExecution {
  digest: Hex;
  transaction: SessionKeyTransaction;
  payload: unknown;
}

export interface PolicyExecutionSubmission {
  route: PolicyExecutionRoute;
  hash: Hex;
  status: "submitted";
}

export interface PolicyExecutionAdapter {
  route: PolicyExecutionRoute;
  check: (request: {
    policy: SessionKeyInfo;
    transaction: SessionKeyTransaction;
  }) => Promise<PolicyExecutionCheck>;
  prepare: (request: {
    policy: SessionKeyInfo;
    transaction: SessionKeyTransaction;
  }) => Promise<PreparedPolicyExecution>;
  broadcast: (request: {
    policy: SessionKeyInfo;
    prepared: PreparedPolicyExecution;
    signature: Hex;
  }) => Promise<PolicyExecutionSubmission>;
}

/** Recovers the signer of an EIP-191 message and compares; the flow never trusts a signature unrecovered. */
export type PolicySignatureVerifier = (input: {
  message: string;
  signature: `0x${string}`;
  signerAddress: `0x${string}`;
}) => Promise<boolean> | boolean;

export interface DelegationPolicyDeps {
  manager: SessionKeyManager;
  /** Origin bound into the signed message. */
  origin: string;
  /** Connected EOA, bare 0x form, or null. Read at call time. */
  signer: () => `0x${string}` | null;
  signMessage: (message: string) => Promise<string>;
  verifySignature: PolicySignatureVerifier;
  previewExecution: (
    callCount: number,
    atomicity: AtomicityRequirement,
  ) => PolicyExecutionPreview;
  /** Whether gas must be sponsored for a broadcast to count as ready. */
  sponsorship?: AtomicityRequirement;
  adapter?: PolicyExecutionAdapter;
  /** Current on-chain EIP-7702 delegation of the account. Read at call time. */
  delegation: () => {
    delegated: boolean | null;
    delegate: `0x${string}` | null;
  };
  /**
   * For `eip7702` policies: the connected wallet's EIP-712 signature
   * (eth_signTypedData_v4) over `{ domain, types, primaryType, message }` —
   * viem-style typed data, without an `EIP712Domain` entry in `types`.
   */
  signTypedData?: (typedData: DelegationTypedData) => Promise<string>;
  /** For `eip7702` policies: the connected EIP-155 chain number, or null. */
  chainId?: () => number | null;
  /** A host-provided encryption key is required for persistent policies. */
  encryptionKeyConfigured: boolean;
  storageAvailable: () => boolean;
  /** Re-read the policy list after a mutation. */
  refresh: () => Promise<void>;
}

/** The typed data an owner signs to authorize an `eip7702` policy. */
export type DelegationTypedData = ReturnType<typeof delegationTypedData>;

/** Whether the account delegates to the framework's stateless DeleGator. */
function delegatesToStatelessDeleGator(delegation: {
  delegated: boolean | null;
  delegate: `0x${string}` | null;
}): boolean {
  return (
    delegation.delegated === true &&
    delegation.delegate?.toLowerCase() ===
      DELEGATION_FRAMEWORK.eip7702StatelessDeleGator.toLowerCase()
  );
}

// ── Pure helpers ──────────────────────────────────────────────────

function sorted(values: string[] | undefined): string[] | null {
  return values ? [...values].map((value) => value.toLowerCase()).sort() : null;
}

/**
 * True when the adapter's prepared transaction still means what was
 * requested. Fail-closed: a field the caller left undefined is not a
 * wildcard. An adapter may not add a target to a creation, add calldata to
 * a plain transfer, or pick a chain the caller did not name — each of those
 * changes what the session key ends up signing. Only "no value" and "0"
 * (and "no data" and "0x") are treated as the same thing.
 */
export function sameExecutionIntent(
  requested: SessionKeyTransaction,
  prepared: SessionKeyTransaction,
): boolean {
  const sameHex = (left?: string, right?: string, empty?: string) => {
    const l = left === undefined ? empty : left.toLowerCase();
    const r = right === undefined ? empty : right.toLowerCase();
    return l === r;
  };
  const sameQuantity = (left?: string, right?: string) => {
    try {
      return BigInt(left ?? "0") === BigInt(right ?? "0");
    } catch {
      return false;
    }
  };
  return (
    sameHex(requested.to, prepared.to) &&
    sameHex(requested.data, prepared.data, "0x") &&
    sameQuantity(requested.value, prepared.value) &&
    requested.chainId === prepared.chainId
  );
}

/**
 * The exact, deterministic message the main wallet signs. Every scope field
 * is included in canonical order so a stored policy whose scope, signer or
 * origin was altered no longer verifies. There must be exactly one copy of
 * this function.
 */
export function buildDelegationPolicyMessage(
  policy: SessionKeyInfo,
  origin: string,
): string {
  const tokenAllowances = policy.scope.tokenAllowances
    ? Object.entries(policy.scope.tokenAllowances)
        .map(
          ([token, value]) => [token.toLowerCase(), value.toString()] as const,
        )
        .sort(([left], [right]) => left.localeCompare(right))
    : null;
  const payload = {
    version: 1,
    origin,
    signer: policy.signerAddress.toLowerCase(),
    sessionId: policy.id,
    sessionPublicKey: policy.publicKey.toLowerCase(),
    expiresAt: new Date(policy.expiresAt).toISOString(),
    mode: policy.scope.mode,
    limits: {
      maxTotalGas: policy.scope.maxTotalGas?.toString() ?? null,
      maxGasPerTx: policy.scope.maxGasPerTx?.toString() ?? null,
      maxTotalValue: policy.scope.maxTotalValue?.toString() ?? null,
      maxValuePerTx: policy.scope.maxValuePerTx?.toString() ?? null,
      maxTxCount: policy.scope.maxTxCount ?? null,
    },
    allowedContracts: sorted(policy.scope.allowedContracts),
    allowedMethods: sorted(policy.scope.allowedMethods),
    allowedChainIds: policy.scope.allowedChainIds
      ? [...policy.scope.allowedChainIds].sort((left, right) => left - right)
      : null,
    tokenAllowances,
  };
  return `Naculus Session Policy v1\n${JSON.stringify(payload)}`;
}

/** A stored policy is a verification candidate only in this state. */
export function isVerifiablePolicy(policy: SessionKeyInfo): boolean {
  return (
    policy.status === "active" &&
    Boolean(policy.authorized) &&
    (policy.scope.mode === "offchain" || policy.scope.mode === "eip7702")
  );
}

// ── Flow ──────────────────────────────────────────────────────────

export interface DelegationPolicyFlow {
  verifyStoredPolicy: (policy: SessionKeyInfo) => Promise<boolean>;
  createPolicy: (scope: Partial<SessionKeyScope>) => Promise<SessionKeyInfo>;
  revokePolicy: (policyId: string) => Promise<void>;
  previewPolicyExecution: (
    policyId: string,
    tx: SessionKeyTransaction,
    callCount?: number,
    atomicity?: AtomicityRequirement,
  ) => Promise<DelegationPolicyPreview>;
  signPolicyDigest: (
    policyId: string,
    digest: `0x${string}`,
    tx: SessionKeyTransaction,
  ) => Promise<`0x${string}`>;
  executePolicy: (
    policyId: string,
    tx: SessionKeyTransaction,
  ) => Promise<PolicyExecutionSubmission>;
}

export function createDelegationPolicyFlow(
  deps: DelegationPolicyDeps,
): DelegationPolicyFlow {
  const { manager, origin } = deps;

  const verifyStoredPolicy = async (policy: SessionKeyInfo) => {
    // An eip7702 policy's authorization is the owner's signed delegation,
    // verified by connect-core when it was attached; redeeming a tampered
    // record fails on chain, where the delegation signature is checked.
    if (!isVerifiablePolicy(policy)) return false;
    if (policy.scope.mode === "eip7702") return true;
    return manager.verifyOffchainAuthorization(
      policy.id,
      buildDelegationPolicyMessage(policy, origin),
      deps.verifySignature,
    );
  };

  const createPolicy = async (
    scope: Partial<SessionKeyScope>,
  ): Promise<SessionKeyInfo> => {
    const signer = deps.signer();
    if (!signer) {
      throw new WalletError("wallet_unavailable", "No active EVM account");
    }
    if (scope.mode === "eip7702") return createDelegatedPolicy(scope, signer);
    if (scope.mode && scope.mode !== "offchain") {
      throw new WalletError(
        "method_not_allowed",
        "This flow creates off-chain and EIP-7702 policies only; AA-module policies need an on-chain module.",
      );
    }
    if (scope.allowedRecipients && scope.allowedRecipients.length > 0) {
      // connect-core refuses raw-digest signing while recipients are limited,
      // and every execution in this flow signs a raw digest; such a policy
      // could be created and previewed as valid yet never sign. The recipient
      // list is also not part of the owner-signed policy message. Refuse it
      // until this flow has a typed-data path.
      throw new WalletError(
        "method_not_allowed",
        "Recipient-limited policies are not supported by this flow: its executions sign raw digests, which connect-core refuses while allowedRecipients is set.",
      );
    }
    if (!deps.encryptionKeyConfigured) {
      throw new WalletError(
        "method_not_allowed",
        "Persistent delegation policies require a host-provided encryptionKey. The deterministic compatibility fallback is not a production key boundary.",
      );
    }
    if (!deps.storageAvailable()) {
      throw new WalletError(
        "storage_unavailable",
        "Persistent delegation policy storage is unavailable in this browser",
      );
    }
    let draft: SessionKeyInfo | null = null;
    try {
      draft = await manager.createSessionKey(
        { ...scope, mode: "offchain" },
        signer,
      );
      const message = buildDelegationPolicyMessage(draft, origin);
      const signature = await deps.signMessage(message);
      if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
        throw new WalletError(
          "invalid_input",
          "Wallet did not return a valid 65-byte EVM policy signature",
        );
      }
      const recovers = await deps.verifySignature({
        message,
        signature: signature as `0x${string}`,
        signerAddress: signer,
      });
      if (!recovers) {
        throw new WalletError(
          "invalid_input",
          "Policy signature does not recover to the connected EVM account",
        );
      }
      await manager.setAuthorization(draft.id, {
        signerAddress: signer,
        type: "offchain",
        rawSignature: signature as `0x${string}`,
        message,
      });
      const authorized = (await manager.listSessions()).find(
        (policy) => policy.id === draft?.id,
      );
      if (!authorized?.authorized) {
        throw new WalletError(
          "invalid_input",
          "Policy authorization was not persisted",
        );
      }
      if (!(await verifyStoredPolicy(authorized))) {
        throw new WalletError(
          "invalid_input",
          "Persisted policy signature did not verify against its stored scope and origin",
        );
      }
      await deps.refresh();
      return authorized;
    } catch (cause) {
      // A draft that never got a valid signature must not stay usable.
      if (draft) {
        try {
          await manager.revokeSession(draft.id);
        } catch {
          // best effort; the draft is unauthorized and cannot sign anyway
        }
      }
      throw cause instanceof Error
        ? cause
        : new Error("Policy creation failed");
    }
  };

  /**
   * An `eip7702` policy: the connected account, already delegated to
   * EIP7702StatelessDeleGatorImpl, signs a Delegation to the session key
   * whose caveats enforce the scope on chain (MetaMask Delegation Framework
   * v1.3.0). connect-core refuses a scope the chain cannot enforce and checks
   * the signature before attaching it.
   */
  const createDelegatedPolicy = async (
    scope: Partial<SessionKeyScope>,
    signer: `0x${string}`,
  ): Promise<SessionKeyInfo> => {
    if (!deps.signTypedData || !deps.chainId) {
      throw new WalletError(
        "method_not_allowed",
        "EIP-7702 policies need the wallet's signTypedData and the current chain.",
      );
    }
    if (!deps.encryptionKeyConfigured) {
      throw new WalletError(
        "method_not_allowed",
        "Persistent delegation policies require a host-provided encryptionKey. The deterministic compatibility fallback is not a production key boundary.",
      );
    }
    if (!deps.storageAvailable()) {
      throw new WalletError(
        "storage_unavailable",
        "Persistent delegation policy storage is unavailable in this browser",
      );
    }
    if (!delegatesToStatelessDeleGator(deps.delegation())) {
      throw new WalletError(
        "method_not_allowed",
        `The account must first delegate to EIP7702StatelessDeleGatorImpl (${DELEGATION_FRAMEWORK.eip7702StatelessDeleGator}).`,
      );
    }
    const chainId = deps.chainId();
    if (chainId === null || !Number.isSafeInteger(chainId)) {
      throw new WalletError("wallet_unavailable", "No connected EVM chain");
    }
    let draft: SessionKeyInfo | null = null;
    try {
      draft = await manager.createSessionKey(
        { ...scope, mode: "eip7702" },
        signer,
      );
      const delegation = await manager.prepareDelegation(draft.id, chainId);
      const signature = await deps.signTypedData(
        delegationTypedData(delegation),
      );
      if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
        throw new WalletError(
          "invalid_input",
          "Wallet did not return a valid 65-byte EVM signature",
        );
      }
      await manager.attachDelegation(
        draft.id,
        delegation,
        signature as `0x${string}`,
      );
      await deps.refresh();
      return (
        (await manager.listSessions()).find((s) => s.id === draft?.id) ?? draft
      );
    } catch (cause) {
      if (draft) await manager.revokeSession(draft.id).catch(() => {});
      await deps.refresh().catch(() => {});
      throw cause;
    }
  };

  const revokePolicy = async (policyId: string) => {
    await manager.revokeSession(policyId);
    await deps.refresh();
  };

  const previewPolicyExecution = async (
    policyId: string,
    tx: SessionKeyTransaction,
    callCount = 1,
    atomicity: AtomicityRequirement = "preferred",
  ): Promise<DelegationPolicyPreview> => {
    const policy =
      (await manager.listSessions()).find((item) => item.id === policyId) ??
      null;
    const scope = await manager.checkSessionScope(policyId, tx);
    const plan = deps.previewExecution(callCount, atomicity);
    const signer = deps.signer();
    const authorizationVerified = policy
      ? await verifyStoredPolicy(policy)
      : false;
    const signerMatches = Boolean(
      policy &&
        signer &&
        policy.signerAddress.toLowerCase() === signer.toLowerCase(),
    );
    const adapter = deps.adapter;
    let adapterCheck: PolicyExecutionCheck | null = null;
    if (
      policy &&
      adapter &&
      authorizationVerified &&
      signerMatches &&
      scope.valid
    ) {
      try {
        adapterCheck = await adapter.check({ policy, transaction: tx });
      } catch (cause) {
        adapterCheck = {
          ready: false,
          authorizationInstalled: false,
          sponsored: false,
          promptless: false,
          reason:
            cause instanceof Error
              ? `Execution adapter check failed: ${cause.message}`
              : "Execution adapter check failed.",
        };
      }
    }
    const delegation = deps.delegation();
    const delegationMatches = Boolean(
      adapter?.route !== "eip7702" ||
        (delegation.delegated === true &&
          adapterCheck?.executorAddress &&
          delegation.delegate?.toLowerCase() ===
            adapterCheck.executorAddress.toLowerCase()),
    );
    const delegatedPolicy = policy?.scope.mode === "eip7702";
    const policyReady = Boolean(
      policy?.status === "active" &&
        policy.authorized &&
        authorizationVerified &&
        (policy.scope.mode === "offchain" || delegatedPolicy) &&
        signerMatches &&
        scope.valid,
    );
    const adapterSponsorshipReady = Boolean(
      deps.sponsorship !== "required" || adapterCheck?.sponsored,
    );
    const broadcastReady = Boolean(
      policyReady &&
        callCount === 1 &&
        adapterCheck?.ready &&
        adapterCheck.authorizationInstalled &&
        adapterCheck.promptless &&
        adapterSponsorshipReady &&
        delegationMatches &&
        // An eip7702 policy executes only through a redemption: the key
        // signs nothing else, so only an eip7702 adapter can carry it.
        (!delegatedPolicy || adapter?.route === "eip7702"),
    );
    const ready = Boolean(
      policyReady &&
        (delegatedPolicy ? broadcastReady : plan.route || broadcastReady),
    );
    const reason = !policy
      ? "Policy not found."
      : policy.status !== "active"
        ? `Policy is ${policy.status}.`
        : !policy.authorized
          ? "The main wallet has not signed this policy."
          : !authorizationVerified
            ? "The persisted policy signature no longer matches its scope, signer, or origin."
            : !signerMatches
              ? "The connected account is not the policy signer."
              : !scope.valid
                ? (scope.reason ??
                  "The transaction is outside the policy scope.")
                : broadcastReady
                  ? `The configured ${adapter?.route ?? "AA/7702"} adapter can submit this policy-authorized operation without another main-wallet prompt.${adapterCheck?.sponsored ? " Gas sponsorship is guaranteed." : ""} ${adapterCheck?.reason ?? "The on-chain execution adapter is ready."}`
                  : !adapter
                    ? `${plan.reason} The signed off-chain policy permits this request; an AA/7702 adapter is still required to broadcast without another wallet prompt.`
                    : !adapterCheck?.ready ||
                        !adapterCheck.authorizationInstalled
                      ? `${plan.reason} ${adapterCheck?.reason ?? "The execution adapter is not ready."}`
                      : !adapterCheck.promptless
                        ? `${plan.reason} The configured adapter would invoke the main wallet again, so promptless broadcast is not ready.`
                        : !adapterSponsorshipReady
                          ? `${plan.reason} Sponsored gas is required, but the configured adapter does not guarantee sponsorship.`
                          : callCount !== 1
                            ? `${plan.reason} This policy adapter prepares one execution at a time and cannot claim a multi-call broadcast.`
                            : !delegationMatches
                              ? `${plan.reason} The configured EIP-7702 executor does not match the account's on-chain delegation.`
                              : !plan.route
                                ? plan.reason
                                : `${plan.reason} ${adapterCheck.reason}`;
    return {
      policy,
      scope,
      execution: plan,
      signerMatches,
      authorizationVerified,
      ready,
      broadcastReady,
      broadcastRoute: broadcastReady ? (adapter?.route ?? null) : null,
      onchainAuthorizationVerified: Boolean(
        adapterCheck?.authorizationInstalled && delegationMatches,
      ),
      broadcastSponsored: broadcastReady
        ? (adapterCheck?.sponsored ?? false)
        : null,
      broadcastPromptless: Boolean(broadcastReady && adapterCheck?.promptless),
      reason,
    };
  };

  const signVerified = (
    policyId: string,
    digest: `0x${string}`,
    tx: SessionKeyTransaction,
  ) =>
    manager.signWithVerifiedOffchainAuthorization(
      policyId,
      (authoritativePolicy) =>
        buildDelegationPolicyMessage(authoritativePolicy, origin),
      deps.verifySignature,
      digest,
      tx,
    );

  /**
   * An eip7702 policy's signature is over its redemption transaction. The
   * adapter hands the redemption facts in `payload`; connect-core re-encodes
   * the redemption from the stored delegation and refuses anything else.
   */
  const signRedemption = (
    policyId: string,
    prepared: PreparedPolicyExecution,
  ) => {
    const payload = prepared.payload as
      | {
          outerTx?: {
            to?: string;
            value?: string;
            data?: string;
            chainId?: number;
            gas?: string;
          };
          execution?: {
            target: `0x${string}`;
            value: bigint;
            callData: `0x${string}`;
          };
        }
      | null
      | undefined;
    if (!payload?.outerTx || !payload.execution) {
      throw new WalletError(
        "invalid_input",
        "The EIP-7702 adapter did not return a redemption to sign.",
      );
    }
    // The redemption runs on the delegation's chain; a request for another
    // chain must not be silently redirected there.
    if (
      prepared.transaction.chainId !== undefined &&
      prepared.transaction.chainId !== payload.outerTx.chainId
    ) {
      throw new WalletError(
        "chain_mismatch",
        `The delegation is for chain ${String(payload.outerTx.chainId)}, not ${prepared.transaction.chainId}.`,
      );
    }
    // The execution redeemed must be the transaction that was checked.
    const { execution } = payload;
    if (
      typeof execution.value !== "bigint" ||
      execution.value < 0n ||
      !sameExecutionIntent(prepared.transaction, {
        to: execution.target,
        data: execution.callData,
        value: `0x${execution.value.toString(16)}`,
        chainId: prepared.transaction.chainId,
      })
    ) {
      throw new WalletError(
        "invalid_input",
        "The EIP-7702 adapter's execution differs from the requested transaction.",
      );
    }
    return manager.signDelegationRedemption(
      policyId,
      prepared.digest,
      payload.outerTx,
      payload.execution,
    );
  };

  const signPolicyDigest = async (
    policyId: string,
    digest: `0x${string}`,
    tx: SessionKeyTransaction,
  ) => {
    const preview = await previewPolicyExecution(policyId, tx, 1, "any");
    if (preview.policy?.scope.mode === "eip7702") {
      throw new WalletError(
        "method_not_allowed",
        "An EIP-7702 policy signs only its delegation redemptions; use executePolicy.",
      );
    }
    if (!preview.ready) {
      throw new WalletError("method_not_allowed", preview.reason);
    }
    return signVerified(policyId, digest, tx);
  };

  const executePolicy = async (
    policyId: string,
    tx: SessionKeyTransaction,
  ): Promise<PolicyExecutionSubmission> => {
    const adapter = deps.adapter;
    if (!adapter) {
      throw new WalletError(
        "method_not_allowed",
        "No session-policy-aware AA/7702 execution adapter is configured.",
      );
    }
    const preview = await previewPolicyExecution(policyId, tx, 1, "any");
    if (!preview.broadcastReady || !preview.policy) {
      throw new WalletError("method_not_allowed", preview.reason);
    }
    const prepared = await adapter.prepare({
      policy: preview.policy,
      transaction: tx,
    });
    if (!/^0x[0-9a-fA-F]{64}$/.test(prepared.digest)) {
      throw new WalletError(
        "invalid_input",
        "Execution adapter returned a digest that is not 32 bytes.",
      );
    }
    if (!sameExecutionIntent(tx, prepared.transaction)) {
      throw new WalletError(
        "invalid_input",
        "Execution adapter changed the requested target, value, data, or chain.",
      );
    }
    // Re-check against what will actually be signed, not the request.
    const currentCheck = await adapter.check({
      policy: preview.policy,
      transaction: prepared.transaction,
    });
    const delegation = deps.delegation();
    const currentDelegationMatches =
      adapter.route !== "eip7702" ||
      (delegation.delegated === true &&
        currentCheck.executorAddress !== undefined &&
        delegation.delegate?.toLowerCase() ===
          currentCheck.executorAddress.toLowerCase());
    if (
      !currentCheck.ready ||
      !currentCheck.authorizationInstalled ||
      !currentCheck.promptless ||
      (deps.sponsorship === "required" && !currentCheck.sponsored) ||
      !currentDelegationMatches
    ) {
      throw new WalletError(
        "method_not_allowed",
        currentCheck.reason ||
          "The on-chain policy authorization is not ready.",
      );
    }
    const signature =
      preview.policy.scope.mode === "eip7702"
        ? await signRedemption(policyId, prepared)
        : await signVerified(policyId, prepared.digest, prepared.transaction);
    const submission = await adapter.broadcast({
      policy: preview.policy,
      prepared,
      signature,
    });
    if (
      submission.route !== adapter.route ||
      submission.status !== "submitted" ||
      !/^0x[0-9a-fA-F]{64}$/.test(submission.hash)
    ) {
      throw new WalletError(
        "invalid_input",
        "Execution adapter returned an invalid submission result.",
      );
    }
    await deps.refresh();
    return submission;
  };

  return {
    verifyStoredPolicy,
    createPolicy,
    revokePolicy,
    previewPolicyExecution,
    signPolicyDigest,
    executePolicy,
  };
}
