# `@naculus/connect-appkit-core`

## Authorization and settlement views

`describeAuthorization` builds network-free consent text from a connect-core
`Authorization` or `ListedAuthorization`. Pass asset metadata explicitly to
show symbols and decimal amounts; without it, the view deliberately shows the
asset address and base units. `explainSpend` turns every evaluator refusal into
UI text without changing the authorization decision.

`describePayment` marks every server-reported settlement as `unverified`.
`applySettlementVerification` is the only helper that changes that state, and
the settlement label becomes verified only for a `verified` result.
