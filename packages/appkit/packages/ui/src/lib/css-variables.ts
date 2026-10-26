/**
 * CSS Variables — Theme contract + host mapping utilities.
 *
 * Two APIs live here:
 *   1. THEME_CONTRACT (consumed by ThemeContext for computed/fallback modes)
 *   2. REQUIRED_VARS / OPTIONAL_VARS / DARK_VARS (Mode C mapping docs)
 */

// ── Theme Contract (consumed by ThemeContext) ─────────────────────
//   These are the canonical shadcn CSS variable names and their default
//   fallback values. Do NOT remove — ThemeContext.test.tsx depends on them.

export interface ThemeVariable {
  name: string
  fallback: string
}

export const THEME_CONTRACT = {
  primary: { name: '--primary', fallback: '221.2 83.2% 53.3%' },
  'primary-foreground': { name: '--primary-foreground', fallback: '210 40% 98%' },
  background: { name: '--background', fallback: '0 0% 100%' },
  foreground: { name: '--foreground', fallback: '222.2 84% 4.9%' },
  card: { name: '--card', fallback: '0 0% 100%' },
  'card-foreground': { name: '--card-foreground', fallback: '222.2 84% 4.9%' },
  popover: { name: '--popover', fallback: '0 0% 100%' },
  'popover-foreground': { name: '--popover-foreground', fallback: '222.2 84% 4.9%' },
  secondary: { name: '--secondary', fallback: '210 40% 96.1%' },
  'secondary-foreground': { name: '--secondary-foreground', fallback: '222.2 47.4% 11.2%' },
  muted: { name: '--muted', fallback: '210 40% 96.1%' },
  'muted-foreground': { name: '--muted-foreground', fallback: '215.4 16.3% 46.9%' },
  accent: { name: '--accent', fallback: '210 40% 96.1%' },
  'accent-foreground': { name: '--accent-foreground', fallback: '222.2 47.4% 11.2%' },
  destructive: { name: '--destructive', fallback: '0 84.2% 60.2%' },
  border: { name: '--border', fallback: '214.3 31.8% 91.4%' },
  input: { name: '--input', fallback: '214.3 31.8% 91.4%' },
  ring: { name: '--ring', fallback: '221.2 83.2% 53.3%' },
  radius: { name: '--radius', fallback: '0.5rem' },
} as const

export type ThemeVariableName = keyof typeof THEME_CONTRACT

const cache = new Map<string, string>()

function computeValue(name: ThemeVariableName): string {
  const { name: varName, fallback } = THEME_CONTRACT[name]
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  return value || fallback
}

export function getCSSVariable(name: ThemeVariableName): string {
  const cached = cache.get(name)
  if (cached !== undefined) return cached
  const value = computeValue(name)
  cache.set(name, value)
  return value
}

export function clearCSSVariableCache(): void {
  cache.clear()
}

export function refreshCSSVariable(name: ThemeVariableName): string {
  const value = computeValue(name)
  cache.set(name, value)
  return value
}

export function getThemeStyles(): Record<string, string> {
  const styles: Record<string, string> = {}
  for (const key of Object.keys(THEME_CONTRACT) as ThemeVariableName[]) {
    styles[key] = getCSSVariable(key)
  }
  return styles
}

export function isCSSVariableDefined(name: ThemeVariableName): boolean {
  if (typeof window === 'undefined') return false
  const cached = cache.get(name)
  if (cached !== undefined) return cached.length > 0
  const value = computeValue(name)
  cache.set(name, value)
  return value.length > 0
}

export function getDefinedCSSVariables(): ThemeVariableName[] {
  return Object.keys(THEME_CONTRACT).filter((n) =>
    isCSSVariableDefined(n as ThemeVariableName)
  ) as ThemeVariableName[]
}

// ── Mode C: Host theme mapping (documentation + generate helper) ──

export const REQUIRED_VARS = {
  "--background":       { fallback: "0 0% 100%",      desc: "Page background color (HSL)" },
  "--foreground":       { fallback: "222.2 84% 4.9%", desc: "Primary text color (HSL)" },
  "--primary":          { fallback: "221.2 83.2% 53.3%", desc: "Primary action color (HSL)" },
  "--primary-foreground": { fallback: "210 40% 98%",  desc: "Text on primary surfaces (HSL)" },
  "--border":           { fallback: "214.3 31.8% 91.4%", desc: "Border color (HSL)" },
  "--ring":             { fallback: "221.2 83.2% 53.3%", desc: "Focus ring color (HSL)" },
} as const;

export const OPTIONAL_VARS = {
  "--card":               { fallback: "0 0% 100%",       desc: "Card surface" },
  "--card-foreground":    { fallback: "222.2 84% 4.9%",  desc: "Card text" },
  "--popover":            { fallback: "0 0% 100%",       desc: "Popover surface" },
  "--popover-foreground": { fallback: "222.2 84% 4.9%",  desc: "Popover text" },
  "--secondary":          { fallback: "210 40% 96.1%",   desc: "Secondary surface" },
  "--secondary-foreground": { fallback: "222.2 47.4% 11.2%", desc: "Secondary text" },
  "--muted":              { fallback: "210 40% 96.1%",   desc: "Muted/disabled surface" },
  "--muted-foreground":   { fallback: "215.4 16.3% 46.9%", desc: "Muted text" },
  "--accent":             { fallback: "210 40% 96.1%",   desc: "Accent surface" },
  "--accent-foreground":  { fallback: "222.2 47.4% 11.2%", desc: "Accent text" },
  "--destructive":        { fallback: "0 84.2% 60.2%",   desc: "Destructive action" },
  "--destructive-foreground": { fallback: "210 40% 98%", desc: "Destructive text" },
  "--input":              { fallback: "214.3 31.8% 91.4%", desc: "Input border" },
  "--radius":             { fallback: "0.5rem",          desc: "Border radius" },
} as const;

export const DARK_VARS = {
  "--background":         { value: "222.2 84% 4.9%" },
  "--foreground":         { value: "210 40% 98%" },
  "--primary":            { value: "217.2 91.2% 59.8%" },
  "--primary-foreground": { value: "222.2 47.4% 11.2%" },
  "--border":             { value: "217.2 32.6% 17.5%" },
  "--ring":               { value: "224.3 76.3% 48%" },
} as const;

export function generateVarCSS(
  vars: Record<string, { value?: string; fallback?: string }>,
  selector: string = ":root",
): string {
  const rules = Object.entries(vars)
    .filter(([, v]) => v.value || v.fallback)
    .map(([k, v]) => `  ${k}: ${v.value || v.fallback};`)
    .join("\n");
  return `${selector} {\n${rules}\n}`;
}
