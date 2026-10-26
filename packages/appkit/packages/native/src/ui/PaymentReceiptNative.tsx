import {
  type AuthorizationAssetMetadata,
  formatAuthorizationAmount,
  type PaymentRecord,
  type PaymentVerificationStatus,
} from "@naculus/connect-appkit-core";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CopyableValue, Glyph, type Tone, toneColors } from "./parts";
import { type NativePaymentTheme, useNativePaymentTheme } from "./theme";

export interface PaymentReceiptNativeProps {
  record: PaymentRecord;
  assets?: Record<string, AuthorizationAssetMetadata>;
  /**
   * Accepted for parity with the other payment components; the receipt has
   * no locale-dependent text yet (amounts use the core formatter).
   */
  locale?: string;
  /** Shows "View on explorer" when set and the record has a reference. */
  onOpenExplorer?: (record: PaymentRecord) => void;
  /** Copies the recipient or settlement reference. */
  onCopy?: (text: string) => void;
  theme?: NativePaymentTheme;
}

const VERIFICATION: Record<
  PaymentVerificationStatus,
  { title: string; detail: string; glyph: string; tone: Tone }
> = {
  unverified: {
    title: "Unverified",
    detail: "Reported by the server, not yet checked.",
    glyph: "?",
    tone: "neutral",
  },
  pending: {
    title: "Checking",
    detail: "Checking on chain.",
    glyph: "…",
    tone: "neutral",
  },
  verified: {
    title: "Verified",
    detail: "Verified on chain.",
    glyph: "✓",
    tone: "success",
  },
  mismatch: {
    title: "Mismatch",
    detail: "The on-chain settlement does not match this payment.",
    glyph: "!",
    tone: "danger",
  },
  failed: {
    title: "Verification failed",
    detail: "The settlement could not be verified.",
    glyph: "!",
    tone: "danger",
  },
  unavailable: {
    title: "Verification unavailable",
    detail: "On-chain checking is unavailable. Retry later.",
    glyph: "?",
    tone: "neutral",
  },
};

/** React Native counterpart of the web `PaymentReceipt`. */
export function PaymentReceiptNative({
  record,
  assets = {},
  onOpenExplorer,
  onCopy,
  theme: themeProp,
}: PaymentReceiptNativeProps) {
  const theme = useNativePaymentTheme(themeProp);
  const status = record.verification.status;
  const state = VERIFICATION[status];
  const colors = toneColors(theme, state.tone);
  const muted = { color: theme.mutedForeground };
  const amount =
    record.amount === null
      ? "Amount not reported"
      : /^\d+$/.test(record.amount)
        ? formatAuthorizationAmount(
            BigInt(record.amount),
            record.asset ? assets[record.asset] : undefined,
          ).formatted
        : `${record.amount} base units`;

  return (
    <View
      testID={`verification-${status}`}
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.eyebrow, muted]}>PAYMENT RECEIPT</Text>
        <Text
          accessibilityRole="header"
          style={[styles.amount, { color: theme.foreground }]}
        >
          {amount}
        </Text>
        <Text style={[styles.small, muted]}>
          {record.asset
            ? (assets[record.asset]?.symbol ?? record.asset)
            : "Asset not reported"}
        </Text>
      </View>

      <View
        testID="verification-panel"
        accessibilityLiveRegion="polite"
        accessible
        accessibilityLabel={`${state.title}. ${state.detail}${record.verification.reason ? ` Reason: ${record.verification.reason}` : ""}`}
        style={[
          styles.panel,
          {
            backgroundColor: colors.backgroundColor,
            borderColor: colors.borderColor,
          },
        ]}
      >
        <Glyph color={colors.color}>{state.glyph}</Glyph>
        <View style={styles.flexShrink}>
          <Text style={[styles.badge, { color: colors.color }]}>
            {state.title}
          </Text>
          <Text style={[styles.body, { color: colors.color }]}>
            {state.detail}
          </Text>
          {record.verification.reason && (
            <Text
              numberOfLines={2}
              style={[styles.body, styles.strong, { color: colors.color }]}
            >
              Reason: {record.verification.reason}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={[styles.small, muted]}>Recipient</Text>
        {record.payTo ? (
          <CopyableValue value={record.payTo} onCopy={onCopy} theme={theme} />
        ) : (
          <Text style={[styles.body, { color: theme.foreground }]}>
            Not reported
          </Text>
        )}
      </View>
      <View style={styles.row}>
        <View style={styles.cell}>
          <Text style={[styles.small, muted]}>Protocol</Text>
          <Text style={[styles.body, { color: theme.foreground }]}>
            {record.protocol === "mpp" ? "MPP" : record.protocol}
          </Text>
        </View>
        <View style={styles.cell}>
          <Text style={[styles.small, muted]}>Time</Text>
          <Text style={[styles.body, { color: theme.foreground }]}>
            Not recorded
          </Text>
        </View>
      </View>
      <View style={styles.field}>
        <Text style={[styles.small, muted]}>Settlement reference</Text>
        {record.reference ? (
          <>
            <CopyableValue
              value={record.reference}
              onCopy={onCopy}
              theme={theme}
            />
            {onOpenExplorer && (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="View on explorer"
                onPress={() => onOpenExplorer(record)}
                style={styles.link}
              >
                <Text style={[styles.linkText, { color: theme.foreground }]}>
                  View on explorer ↗
                </Text>
              </Pressable>
            )}
          </>
        ) : (
          <Text style={[styles.body, { color: theme.foreground }]}>
            Not reported
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 16 },
  header: { alignItems: "center", gap: 4 },
  eyebrow: { fontSize: 12, fontWeight: "500", letterSpacing: 0.6 },
  amount: {
    fontSize: 32,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  small: { fontSize: 12 },
  body: { fontSize: 14, lineHeight: 20 },
  strong: { fontWeight: "600" },
  // Fixed height: badge, explanation and a two-line reason fit, so the card
  // does not jump as verification moves from pending to its final state.
  panel: {
    height: 128,
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    overflow: "hidden",
  },
  flexShrink: { flexShrink: 1 },
  badge: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  field: { gap: 4 },
  row: { flexDirection: "row", gap: 12 },
  cell: { flex: 1, gap: 4 },
  link: { minHeight: 44, minWidth: 44, justifyContent: "center" },
  linkText: {
    fontSize: 13,
    fontWeight: "500",
    textDecorationLine: "underline",
  },
});
