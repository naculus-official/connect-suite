# Audit exceptions

Time-limited exceptions configured in `pnpm-workspace.yaml` under `auditConfig.ignoreGhsas`.

| Advisory id | Package | Version | Path | Severity | Reason | Owner | Removal condition | Date |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GHSA-86w9-cpqp-85rv | node-forge | 1.4.0 | appkit native > expo > @expo/cli | high | No patched version on npm yet (fix is 1.4.1, not published); dev-tooling path only; not in published packages | Repo owner | Remove the ignore when node-forge >= 1.4.1 is on npm and the lockfile is updated; re-check monthly | 2026-10-26 |
