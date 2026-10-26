import type {
  AtomicityRequirement,
  BatchCall,
  CallsStatus,
  ExecutionPlan,
  ExecutionStrategy,
} from "@naculus/connect-core";

export interface PaymasterService {
  url: string;
  context?: Record<string, unknown>;
}

export interface SendCallsOptions {
  chainId?: string;
  strategy?: ExecutionStrategy;
  paymasterService?: PaymasterService;
}

export type SendCallsAction = (
  calls: BatchCall[],
  options?: SendCallsOptions,
) => Promise<string>;

export type GetCallsStatusAction = (hash?: string) => Promise<CallsStatus>;
export type ShowCallsStatusAction = (hash?: string) => Promise<boolean>;

export type ExecutionRoute = "wallet-batch" | "user-operation" | "sequential";

export interface ExecutionPreview extends ExecutionPlan {
  route: ExecutionRoute | null;
}

export type PreviewExecutionAction = (
  callCount: number,
  atomicity?: AtomicityRequirement,
) => ExecutionPreview;

export type ExecuteCallsAction = (
  calls: BatchCall[],
  atomicity?: AtomicityRequirement,
) => Promise<string>;

export type { AtomicityRequirement, BatchCall, CallsStatus, ExecutionStrategy };
