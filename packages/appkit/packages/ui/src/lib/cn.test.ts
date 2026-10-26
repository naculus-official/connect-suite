import { describe, it, expect } from 'vitest'
import { cn } from './cn'

describe('cn (className utility)', () => {
  it('should merge class names', () => {
    const result = cn('foo', 'bar')
    expect(result).toBe('foo bar')
  })

  it('should filter out falsy values', () => {
    const result = cn('foo', false, 'bar', null, 'baz', undefined)
    expect(result).toBe('foo bar baz')
  })

  it('should handle empty strings', () => {
    const result = cn('', 'foo', '')
    expect(result).toBe('foo')
  })

  it('should handle objects with truthy values', () => {
    const result = cn('foo', { bar: true, baz: false })
    expect(result).toBe('foo bar')
  })

  it('should merge Tailwind duplicate classes', () => {
    const result = cn('px-2 px-2', 'py-1 py-1')
    // tailwind-merge should deduplicate
    expect(result).toContain('px-2')
    expect(result).toContain('py-1')
  })
})