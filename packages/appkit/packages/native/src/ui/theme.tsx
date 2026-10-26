import { createContext, type ReactNode, useContext } from "react";
import { useColorScheme } from "react-native";

/**
 * Colors for the payment components. The values come from the appkit tokens
 * (`packages/ui/src/styles/tokens.css`, converted from HSL to hex). Where a
 * token pair falls below 4.5:1 on a payment surface — muted text on the muted
 * fill, the light destructive red as text — the text color is the darker
 * (light) or lighter (dark) step of the same hue, so every text/background
 * pair the components use meets WCAG AA.
 */
export interface NativePaymentTheme {
  scheme: "light" | "dark";
  background: string;
  foreground: string;
  card: string;
  border: string;
  muted: string;
  mutedForeground: string;
  primary: string;
  primaryForeground: string;
  /** Verified receipts and allowed previews only. */
  successBackground: string;
  successBorder: string;
  successForeground: string;
  /** Mismatch / failed receipts, blocked previews, missing restrictions. */
  dangerBackground: string;
  dangerBorder: string;
  dangerForeground: string;
  /** Non-dismissible warnings. */
  warningBackground: string;
  warningBorder: string;
  warningForeground: string;
}

export const lightPaymentTheme: NativePaymentTheme = {
  scheme: "light",
  background: "#ffffff", // --background 0 0% 100%
  foreground: "#020817", // --foreground 222.2 84% 4.9%
  card: "#ffffff", // --card
  border: "#e2e8f0", // --border 214.3 31.8% 91.4%
  muted: "#f1f5f9", // --muted 210 40% 96.1%
  mutedForeground: "#475569", // --muted-foreground hue, one step darker
  primary: "#0f172a", // --primary 222.2 47.4% 11.2%
  primaryForeground: "#f8fafc", // --primary-foreground 210 40% 98%
  successBackground: "#ecfdf5",
  successBorder: "#047857",
  successForeground: "#064e3b",
  dangerBackground: "#fef2f2",
  dangerBorder: "#ef4444", // --destructive 0 84.2% 60.2%
  dangerForeground: "#991b1b",
  warningBackground: "#fffbeb",
  warningBorder: "#b45309",
  warningForeground: "#451a03",
};

export const darkPaymentTheme: NativePaymentTheme = {
  scheme: "dark",
  background: "#020817", // .dark --background
  foreground: "#f8fafc", // .dark --foreground
  card: "#020817", // .dark --card
  border: "#1e293b", // .dark --border 217.2 32.6% 17.5%
  muted: "#1e293b", // .dark --muted
  mutedForeground: "#94a3b8", // .dark --muted-foreground 215 20.2% 65.1%
  primary: "#f8fafc", // .dark --primary
  primaryForeground: "#0f172a", // .dark --primary-foreground
  successBackground: "#022c22",
  successBorder: "#10b981",
  successForeground: "#d1fae5",
  dangerBackground: "#450a0a",
  dangerBorder: "#f87171",
  dangerForeground: "#fecaca",
  warningBackground: "#451a03",
  warningBorder: "#f59e0b",
  warningForeground: "#fef3c7",
};

const ThemeContext = createContext<NativePaymentTheme | undefined>(undefined);

export function NativePaymentThemeProvider({
  theme,
  children,
}: {
  theme: NativePaymentTheme;
  children: ReactNode;
}) {
  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

/** The `theme` prop, else the provider's theme, else the system scheme. */
export function useNativePaymentTheme(
  override?: NativePaymentTheme,
): NativePaymentTheme {
  const provided = useContext(ThemeContext);
  const scheme = useColorScheme();
  return (
    override ??
    provided ??
    (scheme === "dark" ? darkPaymentTheme : lightPaymentTheme)
  );
}
