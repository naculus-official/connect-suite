import type React from 'react'
import { createContext, useContext, useMemo, useEffect, useCallback, useState } from 'react'
import { THEME_CONTRACT, clearCSSVariableCache, type ThemeVariableName } from '../lib/css-variables'

export interface ThemeOverride {
  primary?: string
  'primary-foreground'?: string
  background?: string
  foreground?: string
  card?: string
  'card-foreground'?: string
  popover?: string
  'popover-foreground'?: string
  secondary?: string
  'secondary-foreground'?: string
  muted?: string
  'muted-foreground'?: string
  accent?: string
  'accent-foreground'?: string
  destructive?: string
  'destructive-foreground'?: string
  border?: string
  input?: string
  ring?: string
  radius?: string
}

export type ThemePriority = 'computed' | 'fallback'

interface ThemeContextValue {
  theme: ThemeOverride
  isDark: boolean
  setTheme: (theme: ThemeOverride) => void
  toggleDarkMode: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: {},
  isDark: false,
  setTheme: () => {},
  toggleDarkMode: () => {},
})

export interface ThemeProviderProps {
  children: React.ReactNode
  theme?: ThemeOverride
  defaultDark?: boolean
  priority?: ThemePriority
}

/**
 * A theme value becomes the right-hand side of one CSS declaration. One that
 * could close it (`;`), open or close a block (`{` `}`), start markup (`<`
 * `>`) or break the line would let a theme supplied from outside — a URL
 * parameter, a stored user preference — inject arbitrary CSS, which can read
 * attribute values out of the page. Such values are dropped.
 */
const UNSAFE_CSS_VALUE = /[;{}<>\r\n\\]/

function generateCSS(theme: ThemeOverride): string {
  const rules: string[] = []
  for (const [key, value] of Object.entries(theme)) {
    const cssVar = THEME_CONTRACT[key as ThemeVariableName]
    if (cssVar && value && !UNSAFE_CSS_VALUE.test(String(value))) {
      rules.push('  ' + cssVar.name + ': ' + value + ';')
    }
  }
  if (rules.length === 0) return ''
  return ':root {\n' + rules.join('\n') + '\n}'
}

function getDefinedVars(priority: ThemePriority): Set<string> {
  const defined = new Set<string>()
  if (priority !== 'computed') return defined
  if (typeof document === 'undefined') return defined
  for (const key of Object.keys(THEME_CONTRACT)) {
    const cssVar = THEME_CONTRACT[key as ThemeVariableName]
    const existing = getComputedStyle(document.documentElement).getPropertyValue(cssVar.name).trim()
    if (existing && existing !== cssVar.fallback) {
      defined.add(key)
    }
  }
  return defined
}

export function ThemeProvider({
  children,
  theme = {},
  defaultDark = false,
  priority = 'fallback',
}: ThemeProviderProps) {
  const [customTheme, setCustomTheme] = useState<ThemeOverride>(theme)
  const [isDark, setIsDark] = useState(defaultDark)

  // Clear CSS variable cache when theme changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: customTheme is the trigger: the CSS variable cache must be cleared when the theme changes
  useEffect(() => {
    clearCSSVariableCache()
  }, [customTheme])

  const [devDefined, setDevDefined] = useState<Set<string>>(new Set())
  useEffect(() => {
    setDevDefined(getDefinedVars(priority))
  }, [priority])

  const effectiveTheme = useMemo(() => {
    if (priority === 'fallback' || devDefined.size === 0) return customTheme
    const filtered: ThemeOverride = {}
    for (const [key, value] of Object.entries(customTheme)) {
      if (!devDefined.has(key) && value) {
        filtered[key as keyof ThemeOverride] = value
      }
    }
    return filtered
  }, [customTheme, priority, devDefined])

  const cssString = useMemo(() => generateCSS(effectiveTheme), [effectiveTheme])

  // Dark class management
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (isDark) root.classList.add('dark')
    else root.classList.remove('dark')
    clearCSSVariableCache()
  }, [isDark])

  // Stable style tag ID
  const styleId = useMemo(() => 'w3c-theme-' + Math.random().toString(36).slice(2, 9), [])

  // toggleDarkMode: at TOP LEVEL, not inside useMemo!
  const toggleDarkMode = useCallback(() => setIsDark((prev) => !prev), [])

  const value = useMemo(
    () => ({
      theme: customTheme,
      isDark,
      setTheme: setCustomTheme,
      toggleDarkMode,
    }),
    [customTheme, isDark, toggleDarkMode]
  )

  return (
    <ThemeContext.Provider value={value}>
      {cssString ? (
        <style id={styleId}>{cssString}</style>
      ) : null}
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}

export function useThemeVariable(name: ThemeVariableName): string {
  const { theme } = useTheme()
  const [value, setValue] = useState<string>('')

  useEffect(() => {
    const cssVar = THEME_CONTRACT[name]
    if (!cssVar) return
    const customValue = theme[name as keyof ThemeOverride]
    if (customValue) {
      setValue(customValue)
      return
    }
    if (typeof document === 'undefined') {
      setValue(cssVar.fallback)
      return
    }
    const cssValue = getComputedStyle(document.documentElement)
      .getPropertyValue(cssVar.name)
      .trim()
    setValue(cssValue || cssVar.fallback)
  }, [name, theme])

  return value || THEME_CONTRACT[name]?.fallback || ''
}
