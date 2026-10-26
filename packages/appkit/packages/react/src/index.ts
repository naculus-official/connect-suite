export type {
  PassphraseIntent,
  PassphraseRequest,
  SolanaBalance,
  SolanaConfirmationStatus,
} from "@naculus/connect-core";
// Re-exported from connect-core, where it lives so the Vue layer can use the
// same object. Kept exported here so a React consumer never has to know that.
// Re-exported from connect-core, where the framework-neutral half lives so a
// Vue composable can use it unchanged. A React consumer never has to know.
export {
  formatSol,
  getLatestBlockhash,
  getSignatureStatus,
  getSolanaBalance,
  LAMPORTS_PER_SOL,
  PassphraseCancelledError,
  PassphraseGate,
  parseSol,
  SolanaRpcError,
} from "@naculus/connect-core";
// Re-exported so a UI package can name what the hook returns without taking a
// direct dependency on the connector layer.
export type {
  StorageSecurityFinding,
  StorageSecurityReport,
  WalletAccount,
  WalletData,
  WalletNamespace,
} from "@naculus/connector-embedded";
export type {
  CostComparison,
  CostComparisonOperation,
  CostComparisonOptions,
  ExecuteError,
  ExecuteOptions,
  ExecuteRouteResult,
  Quote,
  QuoteOptions,
  UseCompareCostsInput,
  UseCompareCostsReturn,
  UseExecuteRouteReturn,
  UseRouteQuoteInput,
  UseRouteQuoteReturn,
} from "./chain-abstraction";
export {
  useCompareCosts,
  useExecuteRoute,
  useRouteQuote,
} from "./chain-abstraction";
export type {
  ClientConfig,
  InjectedProviderRegistration,
  NativeWalletConnectOptions,
  Web3Client,
} from "./client";
export { clearClient, createClient, getClient } from "./client";
export { useAccount } from "./hooks/useAccount";
export type {
  UseAuthorizationsOptions,
  UseAuthorizationsReturn,
} from "./hooks/useAuthorizations";
export { useAuthorizations } from "./hooks/useAuthorizations";
export { useBalance } from "./hooks/useBalance";
export type {
  AtomicSupport,
  ChainCapabilities,
  UseCapabilitiesReturn,
} from "./hooks/useCapabilities";
export { useCapabilities } from "./hooks/useCapabilities";
export { useChain } from "./hooks/useChain";
export { useConnect } from "./hooks/useConnect";
export type {
  UseDelegateOptions,
  UseDelegateReturn,
} from "./hooks/useDelegate";
export { useDelegate } from "./hooks/useDelegate";
export type {
  UsePaymentFetchOptions,
  UsePaymentFetchReturn,
} from "./hooks/usePaymentFetch";
export { usePaymentFetch } from "./hooks/usePaymentFetch";
export { useX402Signer } from "./hooks/useX402Signer";
export type { UseX402SignerReturn } from "./hooks/useX402Signer";
export type { UseMppSessionReturn } from "./hooks/useMppSession";
export { useMppSession } from "./hooks/useMppSession";
export type { UseSolanaSessionKeyReturn } from "./hooks/useSolanaSessionKey";
export { useSolanaSessionKey } from "./hooks/useSolanaSessionKey";
export type { UseDelegationReturn } from "./hooks/useDelegation";
export { useDelegation } from "./hooks/useDelegation";
export type {
  DelegationPolicyPreview,
  PolicyExecutionAdapter,
  PolicyExecutionCheck,
  PolicyExecutionRoute,
  PolicyExecutionSubmission,
  PreparedPolicyExecution,
  UseDelegationPolicyOptions,
  UseDelegationPolicyReturn,
} from "./hooks/useDelegationPolicy";
export {
  buildDelegationPolicyMessage,
  useDelegationPolicy,
} from "./hooks/useDelegationPolicy";
export { useDisconnect } from "./hooks/useDisconnect";
export type {
  EmbeddedWalletAccountView,
  EmbeddedWalletView,
  UseEmbeddedWalletReturn,
} from "./hooks/useEmbeddedWallet";
export { useEmbeddedWallet } from "./hooks/useEmbeddedWallet";
export type {
  UseERC20AllowanceOptions,
  UseERC20AllowanceReturn,
} from "./hooks/useERC20Allowance";
export { useERC20Allowance } from "./hooks/useERC20Allowance";
export type {
  UseERC20ApproveOptions,
  UseERC20ApproveReturn,
} from "./hooks/useERC20Approve";
export { useERC20Approve } from "./hooks/useERC20Approve";
export type {
  UseERC20TransferOptions,
  UseERC20TransferReturn,
} from "./hooks/useERC20Transfer";
export { useERC20Transfer } from "./hooks/useERC20Transfer";
export type {
  UseERC20TransferSimulationOptions,
  UseERC20TransferSimulationReturn,
} from "./hooks/useERC20TransferSimulation";
export { useERC20TransferSimulation } from "./hooks/useERC20TransferSimulation";
export type {
  ExecutionPreview,
  ExecutionRoute,
  UseExecuteCallsOptions,
  UseExecuteCallsReturn,
} from "./hooks/useExecuteCalls";
export { useExecuteCalls } from "./hooks/useExecuteCalls";
export type { UseLastTxResult } from "./hooks/useLastTx";
export { useLastTx } from "./hooks/useLastTx";
export type {
  UseLookupAddressOptions,
  UseLookupAddressResult,
} from "./hooks/useLookupAddress";
export { useLookupAddress } from "./hooks/useLookupAddress";
export { useNotification } from "./hooks/useNotification";
export type { UsePassphraseGateReturn } from "./hooks/usePassphraseGate";
export { usePassphraseGate } from "./hooks/usePassphraseGate";
export type {
  UseResolveNameOptions,
  UseResolveNameResult,
} from "./hooks/useResolveName";
export { useResolveName } from "./hooks/useResolveName";
export type { SendCallsStatus } from "./hooks/useSendCalls";
export { useSendCalls } from "./hooks/useSendCalls";
export { useSendTransaction } from "./hooks/useSendTransaction";
export type {
  UseSendUserOperationOptions,
  UseSendUserOperationReturn,
} from "./hooks/useSendUserOperation";
export { useSendUserOperation } from "./hooks/useSendUserOperation";
export type { UseSessionReturn } from "./hooks/useSession";
export { useSession } from "./hooks/useSession";
export type {
  UseCreateSessionKeyReturn,
  UseRevokeSessionReturn,
  UseSendWithSessionReturn,
  UseSessionKeysReturn,
} from "./hooks/useSessionKeys";
export {
  resetSessionKeyManager,
  useCreateSessionKey,
  useRevokeSession,
  useSendWithSession,
  useSessionKeys,
} from "./hooks/useSessionKeys";
export type {
  UseSIWxLoginOptions,
  UseSIWxLoginReturn,
} from "./hooks/useSIWxLogin";
export { useSIWxLogin } from "./hooks/useSIWxLogin";
export type {
  UseSIWxSessionOptions,
  UseSIWxSessionReturn,
} from "./hooks/useSIWxSession";
export { useSIWxSession } from "./hooks/useSIWxSession";
export type {
  UseSignInWithEthereumOptions,
  UseSignInWithEthereumReturn,
} from "./hooks/useSignInWithEthereum";
export { useSignInWithEthereum } from "./hooks/useSignInWithEthereum";
export type {
  UseSignInWithXOptions,
  UseSignInWithXReturn,
} from "./hooks/useSignInWithX";
export { useSignInWithX } from "./hooks/useSignInWithX";
export { useSignMessage } from "./hooks/useSignMessage";
export type {
  UseSimulateTransferOptions,
  UseSimulateTransferReturn,
} from "./hooks/useSimulateTransfer";
export { useSimulateTransfer } from "./hooks/useSimulateTransfer";
export type {
  UseSiwxAuthSessionOptions,
  UseSiwxAuthSessionReturn,
} from "./hooks/useSiwxAuthSession";
export { useSiwxAuthSession } from "./hooks/useSiwxAuthSession";
export type {
  UseSmartAccountOptions,
  UseSmartAccountReturn,
} from "./hooks/useSmartAccount";
export { useSmartAccount } from "./hooks/useSmartAccount";
export type { UseSolanaAccountReturn } from "./hooks/useSolanaAccount";
// ── Solana ────────────────────────────────────────────────────────
export { useSolanaAccount } from "./hooks/useSolanaAccount";
export type {
  UseSolanaBalanceOptions,
  UseSolanaBalanceReturn,
} from "./hooks/useSolanaBalance";
export { useSolanaBalance } from "./hooks/useSolanaBalance";
export type {
  SolanaIdentity,
  SolanaPayer,
  SolanaRoles,
  SolanaRolesAbsence,
  SolanaSigner,
  SolanaWalletFeatures,
  UseSolanaRolesReturn,
} from "./hooks/useSolanaRoles";
export { useSolanaRoles } from "./hooks/useSolanaRoles";
export type { UseSolanaTransactionReturn } from "./hooks/useSolanaTransaction";
export { useSolanaTransaction } from "./hooks/useSolanaTransaction";
export type { UseSwitchChainReturn } from "./hooks/useSwitchChain";
export { useSwitchChain } from "./hooks/useSwitchChain";
export type {
  TokenBalanceResult,
  TokenInfo,
  UseTokenBalanceOptions,
} from "./hooks/useTokenBalance";
export { useTokenBalance } from "./hooks/useTokenBalance";
export type {
  ApprovalChange,
  BalanceChange,
  GasInfo,
  RiskAssessment,
  RiskLevel,
  RiskWarning,
  SimulationResult,
  SimulationStatus,
  UseTransactionSimulationReturn,
} from "./hooks/useTransactionSimulation";
export { useTransactionSimulation } from "./hooks/useTransactionSimulation";
export type { UseTxHistoryResult } from "./hooks/useTxHistory";
export { useTxHistory } from "./hooks/useTxHistory";
export type {
  TxMonitorLike,
  TxStatus,
  TxStatusEntry,
  UseTxMonitorResult,
} from "./hooks/useTxMonitor";
export { TxMonitorContext, useTxMonitor } from "./hooks/useTxMonitor";
export type {
  UserOpStatus,
  UseUserOpStatusOptions,
  UseUserOpStatusReturn,
} from "./hooks/useUserOpStatus";
export { useUserOpStatus } from "./hooks/useUserOpStatus";
export type {
  AddressValidationLevel,
  AddressValidationResult,
  UseValidateDestinationOptions,
  UseValidateDestinationReturn,
} from "./hooks/useValidateDestination";
export {
  useValidateDestination,
  validateDestination,
} from "./hooks/useValidateDestination";
export { useViemClient } from "./hooks/useViemClient";
export { useWallet } from "./hooks/useWallet";
export type {
  UserFriendlyError,
  UseWeb3ErrorHandlerReturn,
} from "./hooks/useWeb3ErrorHandler";
export { useWeb3ErrorHandler } from "./hooks/useWeb3ErrorHandler";
export type { Web3ConnectProviderProps } from "./provider/Web3ConnectProvider";
export {
  useWeb3,
  Web3ConnectProvider,
  Web3Context,
} from "./provider/Web3ConnectProvider";
export type {
  TokenSelectorProps,
  UseTokenListOptions,
  UseTokenListReturn,
  UseTokenSearchReturn,
} from "./token-list";
export { TokenSelector, useTokenList, useTokenSearch } from "./token-list";
export type {
  ChainInfo,
  ConnectionStatus,
  EvmTransaction,
  SIWxConfig,
  UseWalletReturn,
  WalletChain,
  Web3Actions,
  Web3ConnectConfig,
  Web3State,
} from "./types";
export {
  DEFAULT_EVM_CHAINS,
  getChainById,
  getDefaultChains,
} from "./utils/chains";
export {
  getUserFriendlyError,
  isRetryableError,
  WALLET_ERROR_DESCRIPTIONS,
  WALLET_ERROR_TITLES,
} from "./utils/errorMessages";
export type { Locale } from "./utils/i18n";
export { getLocale, setLocale, t } from "./utils/i18n";

// ── Stencil WC React wrappers ───────────────────────────────────

export type {
  AppkitAccordionEvents,
  AppkitAccountButtonEvents,
  AppkitAlertDialogEvents,
  AppkitAvatarEvents,
  AppkitBadgeEvents,
  AppkitButtonEvents,
  AppkitCardContentEvents,
  AppkitCardDescriptionEvents,
  AppkitCardEvents,
  AppkitCardFooterEvents,
  AppkitCardHeaderEvents,
  AppkitCardTitleEvents,
  AppkitCheckboxEvents,
  AppkitCollapsibleEvents,
  AppkitConnectButtonEvents,
  AppkitDialogEvents,
  AppkitDropdownMenuEvents,
  AppkitInputEvents,
  AppkitPopoverEvents,
  AppkitProgressEvents,
  AppkitScrollAreaEvents,
  AppkitSelectEvents,
  AppkitSeparatorEvents,
  AppkitSkeletonEvents,
  AppkitSwitchEvents,
  AppkitTabsEvents,
  AppkitToggleGroupEvents,
  AppkitTooltipEvents,
} from "./wc-generated/components";
export {
  AppkitAccordion,
  AppkitAccountButton,
  AppkitAlertDialog,
  AppkitAvatar,
  AppkitBadge,
  AppkitButton,
  AppkitCard,
  AppkitCardContent,
  AppkitCardDescription,
  AppkitCardFooter,
  AppkitCardHeader,
  AppkitCardTitle,
  AppkitCheckbox,
  AppkitCollapsible,
  AppkitConnectButton,
  AppkitDialog,
  AppkitDropdownMenu,
  AppkitInput,
  AppkitPopover,
  AppkitProgress,
  AppkitScrollArea,
  AppkitSelect,
  AppkitSeparator,
  AppkitSkeleton,
  AppkitSwitch,
  AppkitTabs,
  AppkitToggleGroup,
  AppkitTooltip,
} from "./wc-generated/components";
