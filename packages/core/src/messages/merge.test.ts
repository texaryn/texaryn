import { describe, it, expect } from 'vitest'
import { englishMessages } from './english.js'
import { mergeMessages } from './merge.js'

describe('mergeMessages', () => {
  it('replaces only the messages named in the overrides', () => {
    const merged = mergeMessages(englishMessages, {
      requiredIndicator: () => ({ text: '*', placement: 'before' }),
    })
    expect(merged.requiredIndicator()).toEqual({ text: '*', placement: 'before' })
    expect(merged.addItem({})).toEqual(englishMessages.addItem({}))
    expect(merged.removeItem({ position: 1 })).toEqual(englishMessages.removeItem({ position: 1 }))
    expect(merged.errorSummaryHeading({ count: 2 })).toBe('There are 2 problems')
  })

  // An explicit `undefined` is how a spread of optional config arrives, and it
  // must not erase the base.
  it('treats an undefined override as absent', () => {
    const merged = mergeMessages(englishMessages, { addItem: undefined })
    expect(merged.addItem({})).toEqual({ label: 'Add', accessibleName: 'Add item' })
  })

  it('returns a new object and leaves the base untouched', () => {
    const base = { ...englishMessages }
    const merged = mergeMessages(base, { requiredIndicator: () => ({ text: '*', placement: 'after' }) })
    expect(merged).not.toBe(base)
    expect(base.requiredIndicator()).toEqual({ text: '(required)', placement: 'after' })
  })
})
