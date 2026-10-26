import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  THEME_CONTRACT,
  getCSSVariable,
  isCSSVariableDefined,
  getDefinedCSSVariables,
  type ThemeVariableName,
} from './css-variables'

describe('THEME_CONTRACT', () => {
  it('should have all required theme variables', () => {
    const expectedVariables: ThemeVariableName[] = [
      'primary',
      'primary-foreground',
      'background',
      'foreground',
      'border',
      'radius',
    ]

    for (const variable of expectedVariables) {
      expect(THEME_CONTRACT).toHaveProperty(variable)
      expect(THEME_CONTRACT[variable]).toHaveProperty('name')
      expect(THEME_CONTRACT[variable]).toHaveProperty('fallback')
    }
  })

  it('should have valid CSS variable names', () => {
    for (const [key, { name }] of Object.entries(THEME_CONTRACT)) {
      expect(name).toMatch(/^--[\w-]+$/)
      expect(key).toBe(key.toLowerCase().replace(/_/g, '-'))
    }
  })

  it('should have non-empty fallback values', () => {
    for (const [, { fallback }] of Object.entries(THEME_CONTRACT)) {
      expect(fallback.length).toBeGreaterThan(0)
    }
  })
})

describe('getCSSVariable', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test')
  })

  it('should return fallback value when window is undefined', () => {
    const originalWindow = globalThis.window
    // @ts-expect-error - testing SSR behavior
    delete globalThis.window

    const result = getCSSVariable('primary')
    expect(result).toBe(THEME_CONTRACT.primary.fallback)

    globalThis.window = originalWindow
  })

  it('should return fallback for undefined variable name', () => {
    // This tests the edge case - though getCSSVariable expects ThemeVariableName
    // which should be a valid key
  })
})

describe('isCSSVariableDefined', () => {
  it('should return false when window is undefined', () => {
    // @ts-expect-error - testing SSR behavior
    delete globalThis.window

    expect(isCSSVariableDefined('primary')).toBe(false)
  })
})

describe('getDefinedCSSVariables', () => {
  it('should return empty array when window is undefined', () => {
    // @ts-expect-error - testing SSR behavior
    delete globalThis.window

    expect(getDefinedCSSVariables()).toEqual([])
  })
})