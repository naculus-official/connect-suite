import {
  type AuthorizationAssetMetadata,
  type AuthorizationDescription,
  describeAuthorization,
  type SpendExplanation,
} from "@naculus/connect-appkit-core";
import type { Authorization, ListedAuthorization } from "@naculus/connect-core";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  ActionButton,
  Callout,
  CopyableValue,
  styles as shared,
} from "./parts";
import { type NativePaymentTheme, useNativePaymentTheme } from "./theme";

export interface AuthorizationConsentNativeProps {
  /** Who asks: shown as "Allow {name} to pay?". */
  requester: { name: string; icon?: string; origin?: string };
  /** A raw authorization, or a description already built by the caller. */
  authorization: Authorization | ListedAuthorization | AuthorizationDescription;
  assets?: Record<string, AuthorizationAssetMetadata>;
  trustedAssets?: readonly string[];
  /** `explainSpend` result for the payment that triggered this consent. */
  preview?: SpendExplanation;
  onApprove: () => void;
  onDecline: () => void;
  /** Disables Approve and shows "Approving…". */
  busy?: boolean;
  /** Copies a recipient address; the copy button shows only when set. */
  onCopy?: (text: string) => void;
  /** BCP 47 locale for the expiry; English when omitted. */
  locale?: string;
  /** Unix timestamp in seconds, for a stable relative expiry. */
  now?: number;
  enforcement?: "on-chain" | "device";
  theme?: NativePaymentTheme;
}

/** React Native counterpart of the web `AuthorizationConsent`. */
export function AuthorizationConsentNative({
  authorization,
  assets = {},
  trustedAssets,
  locale,
  now,
  enforcement,
  requester,
  preview,
  onApprove,
  onDecline,
  busy = false,
  onCopy,
  theme: themeProp,
}: AuthorizationConsentNativeProps) {
  const theme = useNativePaymentTheme(themeProp);
  const description =
    "expiry" in authorization
      ? authorization
      : describeAuthorization(authorization, {
          assets,
          trustedAssets,
          locale,
          now,
          enforcement,
        });
  const muted = { color: theme.mutedForeground };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.requester}>
          {requester.icon ? (
            <Image
              accessibilityIgnoresInvertColors
              source={{ uri: requester.icon }}
              style={styles.avatar}
            />
          ) : (
            <View
              importantForAccessibility="no"
              style={[styles.avatar, { backgroundColor: theme.muted }]}
            >
              <Text style={[styles.initial, { color: theme.foreground }]}>
                {requester.name.slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.flexShrink}>
            <Text
              accessibilityRole="header"
              style={[shared.heading, { color: theme.foreground }]}
            >
              Allow {requester.name} to pay?
            </Text>
            {requester.origin && (
              <Text style={[styles.small, muted]}>{requester.origin}</Text>
            )}
          </View>
        </View>

        {description.warnings.map((warning) => (
          <Callout
            key={warning}
            tone="warning"
            glyph="⚠"
            role="alert"
            theme={theme}
          >
            <Text style={styles.strong}>{warning}</Text>
          </Callout>
        ))}

        {preview && (
          <Callout
            tone={preview.allowed ? "success" : "danger"}
            glyph={preview.allowed ? "✓" : "✕"}
            theme={theme}
          >
            <Text style={styles.strong}>
              {preview.allowed ? "Allowed" : "Blocked"}.
            </Text>
            <Text> {preview.sentence}</Text>
          </Callout>
        )}

        {description.grants.map((grant) => (
          <View
            key={`${grant.asset}:${grant.recipients.map((r) => r.full).join(",")}:${grant.perPayment.formatted}:${grant.total.formatted}`}
            style={[
              styles.card,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.assetLabel, { color: theme.foreground }]}>
              {grant.assetLabel}
            </Text>
            {grant.assetTrust === "unverified" && (
              <Callout tone="warning" glyph="⚠" role="alert" theme={theme}>
                <Text style={styles.strong}>
                  Unverified token — not on the trusted list
                </Text>
              </Callout>
            )}
            <View style={styles.limits}>
              <View style={styles.limit}>
                <Text style={[shared.label, muted]}>Per payment</Text>
                <Text style={[styles.amount, { color: theme.foreground }]}>
                  {grant.perPayment.formatted}
                </Text>
              </View>
              <View style={styles.limit}>
                <Text style={[shared.label, muted]}>Total limit</Text>
                <Text style={[styles.amount, { color: theme.foreground }]}>
                  {grant.total.formatted}
                </Text>
              </View>
            </View>
            {grant.period && (
              <View>
                <Text style={[styles.term, { color: theme.foreground }]}>
                  Period limit
                </Text>
                <Text style={[styles.amount, { color: theme.foreground }]}>
                  Up to {grant.period.amount.formatted} every{" "}
                  {grant.period.every}
                </Text>
                <Text style={[styles.small, muted]}>
                  Starts {grant.period.startsAt}
                </Text>
              </View>
            )}

            <Text style={[styles.term, { color: theme.foreground }]}>
              Recipients
            </Text>
            {grant.recipients.length ? (
              grant.recipients.map((recipient) => (
                <CopyableValue
                  key={recipient.full}
                  value={recipient.full}
                  display={recipient.shortened}
                  onCopy={onCopy}
                  theme={theme}
                />
              ))
            ) : (
              <Text style={[styles.strong, { color: theme.dangerForeground }]}>
                No recipient restriction is displayed
              </Text>
            )}

            <Text style={[styles.term, { color: theme.foreground }]}>
              Payment count
            </Text>
            <Text style={[styles.small, muted]}>
              {grant.count === null ? "No count limit" : `Up to ${grant.count}`}
            </Text>

            <Text style={[styles.term, { color: theme.foreground }]}>
              Payment methods
            </Text>
            <View style={styles.chips}>
              {grant.rails.map((rail) => (
                <View
                  key={rail}
                  style={[
                    shared.chip,
                    { backgroundColor: theme.muted, borderColor: theme.border },
                  ]}
                >
                  <Text style={[shared.chipText, { color: theme.foreground }]}>
                    {rail}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        {description.enforcementLabel && (
          <Text style={[styles.strong, { color: theme.foreground }]}>
            {description.enforcementLabel}
          </Text>
        )}

        <View style={[styles.expiry, { backgroundColor: theme.muted }]}>
          <Text style={[styles.strong, { color: theme.foreground }]}>
            Expires {description.expiry.relative}
          </Text>
          <Text style={[styles.small, muted]}>
            {description.expiry.absolute}
          </Text>
        </View>
      </ScrollView>

      {/* Outside the ScrollView so it stays on screen on short landscape phones. */}
      <View
        testID="payment-actions"
        style={[
          styles.footer,
          { borderTopColor: theme.border, backgroundColor: theme.background },
        ]}
      >
        <ActionButton
          label="Decline"
          variant="secondary"
          onPress={onDecline}
          theme={theme}
        />
        <ActionButton
          label={busy ? "Approving…" : "Approve"}
          onPress={onApprove}
          disabled={busy}
          busy={busy}
          theme={theme}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  requester: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  initial: { fontSize: 18, fontWeight: "600" },
  flexShrink: { flexShrink: 1 },
  small: { fontSize: 12 },
  strong: { fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 6 },
  assetLabel: { fontSize: 14, fontWeight: "600" },
  limits: { flexDirection: "row", gap: 12, marginVertical: 6 },
  limit: { flex: 1 },
  amount: {
    fontSize: 22,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  term: { fontSize: 14, fontWeight: "500", marginTop: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  expiry: { borderRadius: 10, padding: 12, gap: 2 },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
});
