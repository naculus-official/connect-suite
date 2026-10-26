import { type ReactNode, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativePaymentTheme } from "./theme";

export type Tone = "success" | "danger" | "warning" | "neutral";

/** Fill, border and text color of a tone. */
export function toneColors(theme: NativePaymentTheme, tone: Tone) {
  if (tone === "success")
    return {
      backgroundColor: theme.successBackground,
      borderColor: theme.successBorder,
      color: theme.successForeground,
    };
  if (tone === "danger")
    return {
      backgroundColor: theme.dangerBackground,
      borderColor: theme.dangerBorder,
      color: theme.dangerForeground,
    };
  if (tone === "warning")
    return {
      backgroundColor: theme.warningBackground,
      borderColor: theme.warningBorder,
      color: theme.warningForeground,
    };
  return {
    backgroundColor: theme.muted,
    borderColor: theme.border,
    color: theme.foreground,
  };
}

/** Decorative glyph, hidden from screen readers. */
export function Glyph({
  children,
  color,
}: {
  children: string;
  color: string;
}) {
  return (
    <Text
      accessible={false}
      importantForAccessibility="no"
      accessibilityElementsHidden
      style={[styles.glyph, { color }]}
    >
      {children}
    </Text>
  );
}

export function ActionButton({
  label,
  onPress,
  theme,
  variant = "primary",
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  theme: NativePaymentTheme;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  busy?: boolean;
}) {
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? theme.primary : theme.background,
          borderColor: primary ? theme.primary : theme.border,
          opacity: disabled ? 0.55 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          { color: primary ? theme.primaryForeground : theme.foreground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * An address or hash with an icon-only copy action. The app supplies
 * `onCopy` (Expo Clipboard, RN Clipboard, …); without it no button shows.
 */
export function CopyableValue({
  value,
  display,
  onCopy,
  theme,
  color = theme.foreground,
}: {
  value: string;
  /** Shortened form from the view model; else truncated in the middle. */
  display?: string;
  onCopy?: (text: string) => void;
  theme: NativePaymentTheme;
  color?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <View style={styles.copyRow}>
      <Text
        accessibilityLabel={value}
        numberOfLines={1}
        ellipsizeMode="middle"
        style={[styles.mono, { color }]}
      >
        {display ?? value}
      </Text>
      {onCopy && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copied ? `Copied ${value}` : `Copy ${value}`}
          hitSlop={6}
          onPress={() => {
            onCopy(value);
            setCopied(true);
          }}
          style={({ pressed }) => [
            styles.iconButton,
            { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Glyph color={theme.foreground}>{copied ? "✓" : "⧉"}</Glyph>
        </Pressable>
      )}
    </View>
  );
}

/** A colored callout: warnings, preview verdicts, notices. */
export function Callout({
  tone,
  glyph,
  theme,
  role,
  children,
}: {
  tone: Tone;
  glyph: string;
  theme: NativePaymentTheme;
  role?: "alert";
  children: ReactNode;
}) {
  const colors = toneColors(theme, tone);
  return (
    <View
      accessibilityRole={role}
      style={[
        styles.callout,
        {
          backgroundColor: colors.backgroundColor,
          borderColor: colors.borderColor,
        },
      ]}
    >
      <Glyph color={colors.color}>{glyph}</Glyph>
      <Text style={[styles.calloutText, { color: colors.color }]}>
        {children}
      </Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  glyph: { fontSize: 16, lineHeight: 20, fontWeight: "700" },
  button: {
    flex: 1,
    minHeight: 48,
    minWidth: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  buttonLabel: { fontSize: 16, fontWeight: "600" },
  copyRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  mono: { flexShrink: 1, fontFamily: "monospace", fontSize: 13 },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  callout: {
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  calloutText: { flex: 1, fontSize: 14, lineHeight: 20 },
  label: { fontSize: 12, fontWeight: "500" },
  heading: { fontSize: 18, fontWeight: "600" },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { fontSize: 12 },
});
