import { describe, expect, it } from 'vitest'
import {
  assertDocumentNodeCount,
  assertDocumentTreeDepth,
  documentRuntimeLimitMaximums,
  preflightJson,
  preflightJsonRoots,
  resolveDocumentRuntimeLimits,
} from '../document-limits.js'
import type { DocumentRuntimeLimits } from '../types.js'

describe('document runtime limits', () => {
  it('copies defaults and accepts smaller positive integer limits', () => {
    const defaults = resolveDocumentRuntimeLimits(undefined)
    expect(defaults).toEqual(documentRuntimeLimitMaximums)
    expect(defaults).not.toBe(documentRuntimeLimitMaximums)
    expect(resolveDocumentRuntimeLimits({ maxJsonDepth: 2, maxArrayItems: 3 })).toMatchObject({
      maxJsonDepth: 2,
      maxArrayItems: 3,
      maxTableCells: documentRuntimeLimitMaximums.maxTableCells,
    })
  })

  it('rejects malformed limit records, unsupported keys, and invalid ranges', () => {
    expect(() => resolveDocumentRuntimeLimits(null as unknown as undefined)).toThrow(/limits must be an object/)
    expect(() => resolveDocumentRuntimeLimits([] as unknown as Partial<DocumentRuntimeLimits>)).toThrow(/limits must be an object/)
    expect(() => resolveDocumentRuntimeLimits({ maxJsonDepth: 2, extra: 1 } as unknown as Partial<DocumentRuntimeLimits>)).toThrow(/limits.extra is not supported/)

    for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 65]) {
      expect(() => resolveDocumentRuntimeLimits({ maxJsonDepth: value })).toThrow(/limits.maxJsonDepth must be an integer/)
    }

    const withSymbol = { maxJsonDepth: 2, [Symbol('extra')]: true } as unknown as Partial<DocumentRuntimeLimits>
    expect(() => resolveDocumentRuntimeLimits(withSymbol)).toThrow(/limits.Symbol\(extra\) is not supported/)
  })

  it('preflights nested roots and enforces value, depth, and string limits', () => {
    const limits = resolveDocumentRuntimeLimits({
      maxJsonDepth: 2,
      maxJsonValues: 4,
      maxStringLength: 3,
      maxTotalStringLength: 5,
    })
    expect(() => preflightJsonRoots([
      { value: { a: 'x' }, path: 'first' },
      { value: ['y'], path: 'second' },
    ], limits)).not.toThrow()
    expect(() => preflightJson({ a: { b: { c: 1 } } }, 'value', limits)).toThrow(/maximum JSON depth/)
    expect(() => preflightJson({ a: 'long' }, 'value', limits)).toThrow(/maximum string length/)
    expect(() => preflightJson({ a: 'abc', b: 'de' }, 'value', limits)).toThrow(/maximum total string length/)
    expect(() => preflightJson({ a: 1, b: 2, c: 3, d: 4 }, 'value', limits)).toThrow(/maximum JSON value count/)
  })

  it('rejects non-JSON values and descriptors without evaluating accessors', () => {
    const limits = resolveDocumentRuntimeLimits(undefined)
    const cycle: { child?: unknown } = {}
    cycle.child = cycle
    const sparse = new Array(1)
    const extra = [1] as number[] & { note?: string }
    extra.note = 'extra'
    const withAccessor = {} as { value?: number }
    let getterCalls = 0
    Object.defineProperty(withAccessor, 'value', {
      enumerable: true,
      get() {
        getterCalls += 1
        return 1
      },
    })
    const withSymbol = { [Symbol('extra')]: true }
    const withHidden = {}
    Object.defineProperty(withHidden, 'hidden', { value: true })

    expect(() => preflightJson(cycle, 'value', limits)).toThrow(/contains a cycle/)
    expect(() => preflightJson(sparse, 'value', limits)).toThrow(/non-JSON array property/)
    expect(() => preflightJson(extra, 'value', limits)).toThrow(/non-JSON array property/)
    expect(() => preflightJson(withAccessor, 'value', limits)).toThrow(/must be a JSON property/)
    expect(() => preflightJson(withSymbol, 'value', limits)).toThrow(/symbol properties/)
    expect(() => preflightJson(withHidden, 'value', limits)).toThrow(/must be a JSON property/)
    expect(() => preflightJson(new Date(), 'value', limits)).toThrow(/plain JSON object/)
    expect(() => preflightJson(undefined, 'value', limits)).toThrow(/not a JSON value/)
    expect(getterCalls).toBe(0)
  })

  it('applies per-message work limits and validates node counts and tree depth', () => {
    const limits = resolveDocumentRuntimeLimits({ maxDocumentNodes: 1, maxDocumentTreeDepth: 1 })
    expect(() => preflightJson({ a: 1 }, 'message', resolveDocumentRuntimeLimits(undefined), {
      visitedValues: 0,
      maxVisitedValues: 1,
    })).toThrow(/per-message work limit/)
    expect(() => assertDocumentNodeCount({ root: {}, child: {} }, limits)).toThrow(/maximum node count/)
    expect(() => assertDocumentTreeDepth('root', new Map([
      ['root', { type: 'container', children: ['child'] }],
      ['child', { type: 'text' }],
    ]), limits)).toThrow(/maximum depth/)
    expect(() => assertDocumentTreeDepth('root', new Map([
      ['root', { type: 'container', children: ['root'] }],
    ]), resolveDocumentRuntimeLimits(undefined))).toThrow(/creates a cycle/)
  })
})
