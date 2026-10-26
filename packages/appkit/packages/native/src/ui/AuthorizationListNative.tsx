import {
  type AuthorizationAssetMetadata,
  describeAuthorization,
  formatAuthorizationAmount,
} from "@naculus/connect-appkit-core";
import type {
  ListedAuthorization,
  ListedAuthorizationStatus,
  RevokeListedAuthorizationResult,
} from "@naculus/connect-core";
import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import {
  ActionButton,
  Callout,
  CopyableValue,
  Glyph,
  styles as shared,
  toneColors,
} from "./parts";
import { type NativePaymentTheme, useNativePaymentTheme } from "./theme";

export interface AuthorizationListNativeProps {
  entries: ListedAuthorization[] | { entries: ListedAuthorization[] };
  assets?: Record<string, AuthorizationAssetMetadata>;
  trustedAssets?: readonly string[];
  onRevoke: (
    entry: ListedAuthorization,
  ) =>
    | RevokeListedAuthorizationResult
    | Promise<RevokeListedAuthorizationResult>;
  /** keyId of the entry being revoked. */
  revokingId?: string;
  /** BCP 47 locale for expiry dates; English when omitted. */
  locale?: string;
  getEnforcement?: (
    entry: ListedAuthorization,
  ) => "on-chain" | "device" | undefined;
  onCopy?: (text: string) => void;
  theme?: NativePaymentTheme;
}

const ENFORCER_LABELS: Record<string, string> = {
  "evm-session": "EVM session key",
  "solana-session": "Solana session key",
  "mpp-voucher": "MPP channel key",
};

const STATUS_GLYPHS: Record<ListedAuthorizationStatus, string> = {
  active: "●",
  pending: "◐",
  revoked: "✕",
  expired: "○",
};

function StatusBadge({
  status,
  theme,
}: {
  status: ListedAuthorizationStatus;
  theme: NativePaymentTheme;
}) {
  const colors =
    status === "active"
      ? {
          backgroundColor: theme.primary,
          borderColor: theme.primary,
          color: theme.primaryForeground,
        }
      : status === "pending"
        ? {
            backgroundColor: theme.background,
            borderColor: theme.foreground,
            color: theme.foreground,
          }
        : status === "revoked"
          ? toneColors(theme, "danger")
          : {
              backgroundColor: theme.muted,
              borderColor: theme.border,
              color: theme.mutedForeground,
            };
  return (
    <View
      accessibilityLabel={`Status: ${status}`}
      style={[
        shared.chip,
        styles.badge,
        {
          backgroundColor: colors.backgroundColor,
          borderColor: colors.borderColor,
        },
      ]}
    >
      <Glyph color={colors.color}>{STATUS_GLYPHS[status]}</Glyph>
      <Text style={[styles.badgeText, { color: colors.color }]}>{status}</Text>
    </View>
  );
}

/** React Native counterpart of the web `AuthorizationList`. */
export function AuthorizationListNative({
  entries: input,
  assets = {},
  trustedAssets,
  onRevoke,
  revokingId,
  locale,
  getEnforcement,
  onCopy,
  theme: themeProp,
}: AuthorizationListNativeProps) {
  const theme = useNativePaymentTheme(themeProp);
  const entries = Array.isArray(input) ? input : input.entries;
  const [confirming, setConfirming] = useState<string | null>(null);
  const [onChain, setOnChain] = useState<ReadonlySet<string>>(new Set());
  const muted = { color: theme.mutedForeground };

  const revoke = (entry: ListedAuthorization) =>
    void Promise.resolve(onRevoke(entry)).then((result) => {
      setConfirming(null);
      if (result.onChainRevocationRequired)
        setOnChain((current) => new Set(current).add(entry.keyId));
    });

  const renderItem = ({ item: entry }: { item: ListedAuthorization }) => {
    const view = describeAuthorization(entry, {
      assets,
      trustedAssets,
      locale,
      enforcement: getEnforcement?.(entry),
    });
    const busy = revokingId === entry.keyId;
    const live = entry.status === "active" || entry.status === "pending";
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.flexShrink}>
            <Text style={[styles.title, { color: theme.foreground }]}>
              {view.label ?? view.grants.map((g) => g.assetLabel).join(", ")}
            </Text>
            <Text style={[styles.small, muted]}>
              {ENFORCER_LABELS[entry.enforcer] ??
                entry.enforcer.replaceAll("-", " ")}
            </Text>
          </View>
          <StatusBadge status={entry.status} theme={theme} />
        </View>

        {view.grants.map((grant) => {
          const spent = entry.spent?.[grant.asset];
          const total = entry.grants.find(
            (g) => g.asset === grant.asset,
          )?.maxTotal;
          const percent =
            spent !== undefined && total && total > 0n
              ? Math.min(Number((spent * 100n) / total), 100)
              : 0;
          return (
            <View
              key={grant.asset}
              style={[styles.grant, { backgroundColor: theme.muted }]}
            >
              {view.label && (
                <Text style={[styles.strong, { color: theme.foreground }]}>
                  {grant.assetLabel}
                </Text>
              )}
              {grant.assetTrust === "unverified" && (
                <Callout tone="warning" glyph="⚠" role="alert" theme={theme}>
                  <Text>Unverified token — not on the trusted list</Text>
                </Callout>
              )}
              {grant.recipients.map((recipient) => (
                <CopyableValue
                  key={recipient.full}
                  value={recipient.full}
                  display={recipient.shortened}
                  onCopy={onCopy}
                  theme={theme}
                />
              ))}
              {grant.period && (
                <View>
                  <Text style={[styles.strong, { color: theme.foreground }]}>
                    Up to {grant.period.amount.formatted} every{" "}
                    {grant.period.every}
                  </Text>
                  <Text style={[styles.small, muted]}>
                    Starts {grant.period.startsAt}
                  </Text>
                </View>
              )}
              {spent !== undefined && (
                <View>
                  <View style={styles.spentRow}>
                    <Text style={[styles.small, { color: theme.foreground }]}>
                      Spent{" "}
                      {
                        formatAuthorizationAmount(
                          spent,
                          grant.assetTrust === "unverified"
                            ? undefined
                            : assets[grant.asset],
                        ).formatted
                      }
                    </Text>
                    <Text style={[styles.small, { color: theme.foreground }]}>
                      Total {grant.total.formatted}
                    </Text>
                  </View>
                  <View
                    accessibilityRole="progressbar"
                    accessibilityLabel={`${grant.assetLabel} spent`}
                    accessibilityValue={{ min: 0, max: 100, now: percent }}
                    style={[
                      styles.track,
                      { backgroundColor: theme.background },
                    ]}
                  >
                    <View
                      style={[
                        styles.fill,
                        {
                          width: `${percent}%`,
                          backgroundColor: theme.primary,
                        },
                      ]}
                    />
                  </View>
                </View>
              )}
            </View>
          );
        })}

        {view.enforcementLabel && (
          <Text style={[styles.strong, { color: theme.foreground }]}>
            {view.enforcementLabel}
          </Text>
        )}

        <Text style={[styles.small, muted]}>
          {entry.status === "expired"
            ? "Expired"
            : entry.status === "revoked"
              ? "Revoked"
              : `Expires ${view.expiry.relative}`}{" "}
          · {view.expiry.absolute}
        </Text>

        {view.warnings.map((warning) => (
          <Callout
            key={warning}
            tone="warning"
            glyph="⚠"
            role="alert"
            theme={theme}
          >
            {warning}
          </Callout>
        ))}

        {onChain.has(entry.keyId) && (
          <Callout tone="warning" glyph="⛓" theme={theme}>
            <Text>
              Local access is revoked. Complete the on-chain revocation to stop
              this authorization on chain.
            </Text>
          </Callout>
        )}

        {live && (
          <View style={[styles.actions, { borderTopColor: theme.border }]}>
            {confirming === entry.keyId ? (
              <>
                <ActionButton
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setConfirming(null)}
                  theme={theme}
                />
                <ActionButton
                  label={busy ? "Revoking…" : "Confirm revoke"}
                  disabled={busy}
                  busy={busy}
                  onPress={() => revoke(entry)}
                  theme={theme}
                />
              </>
            ) : (
              <ActionButton
                label="Revoke"
                variant="secondary"
                onPress={() => setConfirming(entry.keyId)}
                theme={theme}
              />
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <FlatList
      data={entries}
      keyExtractor={(entry) => entry.keyId}
      renderItem={renderItem}
      extraData={[confirming, onChain, revokingId, theme]}
      contentContainerStyle={styles.list}
      style={{ backgroundColor: theme.background }}
      ListHeaderComponent={
        entries.length ? (
          <Text
            accessibilityRole="header"
            style={[shared.heading, { color: theme.foreground }]}
          >
            Payment authorizations
          </Text>
        ) : undefined
      }
      ListEmptyComponent={
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: theme.foreground }]}
          >
            No payment authorizations
          </Text>
          <Text style={[styles.body, muted]}>
            Approvals you create will appear here.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 10 },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  flexShrink: { flexShrink: 1 },
  title: { fontSize: 16, fontWeight: "600" },
  small: { fontSize: 12 },
  body: { fontSize: 14, textAlign: "center" },
  strong: { fontSize: 14, fontWeight: "500" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4 },
  badgeText: { fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  grant: { borderRadius: 10, padding: 12, gap: 6 },
  spentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  track: { height: 8, borderRadius: 4, overflow: "hidden", marginTop: 4 },
  fill: { height: "100%" },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    borderTopWidth: 1,
    paddingTop: 12,
  },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 32,
    alignItems: "center",
    gap: 4,
  },
});
