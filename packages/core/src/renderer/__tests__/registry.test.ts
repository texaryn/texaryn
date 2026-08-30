import { describe, it, expect } from 'vitest'
import { createRendererRegistry } from '../registry.js'
import type { FieldNode } from '../../ir/types.js'
import type { NodeId, JsonPointer } from '../../types.js'

function makeFieldNode(fieldType: string): FieldNode {
  return {
    id: 'node_1' as NodeId,
    type: 'field',
    parentId: null,
    dataPointer: '/test' as JsonPointer,
    order: 0,
    visible: true,
    disabled: false,
    annotations: {},
    fieldType: fieldType as any,
    constraints: {},
  }
}

describe('RendererRegistry', () => {
  it('resolves a registered widget', () => {
    const registry = createRendererRegistry<string>()
    registry.register(
      { test: (n) => n.type === 'field', rank: 1 },
      'FieldWidget',
    )
    expect(registry.resolve(makeFieldNode('string'))).toBe('FieldWidget')
  })

  it('returns undefined when no tester matches', () => {
    const registry = createRendererRegistry<string>()
    registry.register(
      { test: () => false, rank: 1 },
      'NeverMatches',
    )
    expect(registry.resolve(makeFieldNode('string'))).toBeUndefined()
  })

  it('higher rank wins when multiple testers match', () => {
    const registry = createRendererRegistry<string>()
    registry.register(
      { test: (n) => n.type === 'field', rank: 1 },
      'LowRank',
    )
    registry.register(
      { test: (n) => n.type === 'field', rank: 10 },
      'HighRank',
    )
    expect(registry.resolve(makeFieldNode('string'))).toBe('HighRank')
  })

  it('first registered wins on equal rank', () => {
    const registry = createRendererRegistry<string>()
    registry.register(
      { test: (n) => n.type === 'field', rank: 5 },
      'First',
    )
    registry.register(
      { test: (n) => n.type === 'field', rank: 5 },
      'Second',
    )
    expect(registry.resolve(makeFieldNode('string'))).toBe('First')
  })
})
