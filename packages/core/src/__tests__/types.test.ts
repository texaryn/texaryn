import { describe, it, expectTypeOf } from 'vitest'
import type {
  NodeId,
  StableItemId,
  JsonPointer,
  MaybePromise,
  JsonSchemaType,
  ValidationResult,
  ValidationError,
  UIDocument,
  UINode,
  NodeBase,
  FieldNode,
  ContainerNode,
  TextNode,
  ActionNode,
  FieldType,
  FieldConstraints,
  EnumOption,
  NodeAnnotations,
  ArrayMeta,
  RuntimeState,
  NodeRuntimeState,
  ValidationState,
  InteractionState,
  SubmissionState,
  SchemaEvaluationPort,
  SchemaProjection,
  NodeProjection,
  AnnotationSet,
  Store,
  UIHints,
  FieldHints,
  ArrayHints,
} from '../index.js'

describe('type definitions compile', () => {
  it('branded types are assignable from string with cast', () => {
    const nodeId = 'test' as NodeId
    const itemId = 'item' as StableItemId
    const pointer = '/foo' as JsonPointer
    expectTypeOf(nodeId).toEqualTypeOf<NodeId>()
    expectTypeOf(itemId).toEqualTypeOf<StableItemId>()
    expectTypeOf(pointer).toEqualTypeOf<JsonPointer>()
  })

  it('UIDocument has required structure', () => {
    expectTypeOf<UIDocument>().toHaveProperty('version')
    expectTypeOf<UIDocument>().toHaveProperty('rootId')
    expectTypeOf<UIDocument>().toHaveProperty('nodes')
  })

  it('UINode is a discriminated union', () => {
    const field: FieldNode = {} as FieldNode
    const container: ContainerNode = {} as ContainerNode
    const text: TextNode = {} as TextNode
    const action: ActionNode = {} as ActionNode
    const node: UINode = field
    expectTypeOf(node).toMatchTypeOf<UINode>()
  })

  it('Store<T> has getSnapshot and subscribe', () => {
    expectTypeOf<Store<number>>().toHaveProperty('getSnapshot')
    expectTypeOf<Store<number>>().toHaveProperty('subscribe')
  })

  it('SchemaEvaluationPort has project and validate', () => {
    expectTypeOf<SchemaEvaluationPort>().toHaveProperty('project')
    expectTypeOf<SchemaEvaluationPort>().toHaveProperty('validate')
  })

  it('MaybePromise accepts sync and async', () => {
    const sync: MaybePromise<number> = 42
    const async: MaybePromise<number> = Promise.resolve(42)
    expectTypeOf(sync).toMatchTypeOf<MaybePromise<number>>()
    expectTypeOf(async).toMatchTypeOf<MaybePromise<number>>()
  })
})
