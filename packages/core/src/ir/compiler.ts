import type {
  SchemaProjection,
  NodeProjection,
  ChildProjection,
} from '../schema/port.js'
import type {
  UIDocument,
  UINode,
  FieldNode,
  FieldType,
  ContainerNode,
  ArrayMeta,
  NodeAnnotations,
} from './types.js'
import type { CompileResult } from './compiler-types.js'
import type { UIHints, ArrayHints } from '../hints/types.js'
import type { IdentityMap } from './runtime-state.js'
import type { JsonPointer, NodeId, StableItemId } from '../types.js'
import { createIdentityMap, registerArray, insertItem } from '../identity/index.js'
import { getAtPointer } from '../json-pointer.js'

let nodeCounter = 0

function nextId(): NodeId {
  return `node_${++nodeCounter}` as NodeId
}

interface CompileContext {
  nodes: Record<string, UINode>
  identityMap: IdentityMap
  pointerToId: Map<string, NodeId>
}

export function compile(
  projection: SchemaProjection,
  data: unknown,
  hints?: UIHints,
): CompileResult {
  nodeCounter = 0
  const nodes: Record<string, UINode> = {}
  const identityMap = createIdentityMap()
  const pointerToId = new Map<string, NodeId>()

  const rootProjection = projection.nodes.get('' as JsonPointer)
  if (!rootProjection) {
    throw new Error('Schema projection missing root node')
  }

  const ctx: CompileContext = { nodes, identityMap, pointerToId }
  const rootId = compileNode(
    '' as JsonPointer,
    rootProjection,
    null,
    0,
    projection,
    data,
    hints,
    ctx,
  )

  return {
    document: { version: 1, rootId, nodes },
    identityMap: ctx.identityMap,
  }
}

function compileNode(
  pointer: JsonPointer,
  proj: NodeProjection,
  parentId: NodeId | null,
  order: number,
  projection: SchemaProjection,
  data: unknown,
  hints: UIHints | undefined,
  ctx: CompileContext,
): NodeId {
  const { nodes } = ctx
  const id = nextId()
  ctx.pointerToId.set(pointer, id)

  const fieldHints = hints?.[pointer]
  const annotations: NodeAnnotations = {
    title: proj.annotations.title,
    description: proj.annotations.description,
    readOnly: proj.annotations.readOnly,
    writeOnly: proj.annotations.writeOnly,
    deprecated: proj.annotations.deprecated,
    examples: proj.annotations.examples,
    default: proj.annotations.default,
  }

  if (proj.type === 'object') {
    const children: NodeId[] = []
    if (proj.children) {
      for (let i = 0; i < proj.children.length; i++) {
        const child: ChildProjection = proj.children[i]
        const childProj = projection.nodes.get(child.pointer)
        if (childProj) {
          const childId = compileNode(
            child.pointer,
            childProj,
            id,
            i,
            projection,
            data,
            hints,
            ctx,
          )
          children.push(childId)
        }
      }
    }

    const node: ContainerNode = {
      id,
      type: 'container',
      containerType: 'object',
      parentId,
      dataPointer: pointer,
      order,
      visible: proj.active,
      disabled: proj.annotations.readOnly ?? false,
      annotations,
      children,
    }
    nodes[id] = node
  } else if (proj.type === 'array') {
    const children: NodeId[] = []
    const items = getAtPointer(data, pointer)
    const arrayItems = Array.isArray(items) ? items : []

    // Identity map API is pure: register/insert return new maps, so we
    // always reassign ctx.identityMap rather than mutate in place.
    ctx.identityMap = registerArray(ctx.identityMap, id)
    const itemStableIds: StableItemId[] = []
    for (let i = 0; i < arrayItems.length; i++) {
      const result = insertItem(ctx.identityMap, id, i)
      ctx.identityMap = result.map
      itemStableIds.push(result.itemId)
    }

    for (let i = 0; i < arrayItems.length; i++) {
      const itemPointer = `${pointer}/${i}` as JsonPointer
      const itemProj = projection.nodes.get(itemPointer)
      if (itemProj) {
        const childId = compileNode(
          itemPointer,
          itemProj,
          id,
          i,
          projection,
          data,
          hints,
          ctx,
        )
        children.push(childId)
      }
    }

    const arrayHints = hints?.[pointer] as ArrayHints | undefined
    const arrayMeta: ArrayMeta = {
      itemIds: itemStableIds,
      itemKey: arrayHints?.itemKey,
      minItems: proj.constraints.minItems,
      maxItems: proj.constraints.maxItems,
      canAdd: proj.constraints.maxItems == null || arrayItems.length < proj.constraints.maxItems,
      canRemove: proj.constraints.minItems == null || arrayItems.length > proj.constraints.minItems,
      canReorder: arrayHints?.canReorder ?? false,
    }

    const node: ContainerNode = {
      id,
      type: 'container',
      containerType: 'array',
      parentId,
      dataPointer: pointer,
      order,
      visible: proj.active,
      disabled: proj.annotations.readOnly ?? false,
      annotations,
      children,
      arrayMeta,
    }
    nodes[id] = node
  } else {
    const fieldType: FieldType = proj.type === 'null' ? 'string' : proj.type
    const node: FieldNode = {
      id,
      type: 'field',
      parentId,
      dataPointer: pointer,
      order,
      visible: proj.active,
      disabled: proj.annotations.readOnly ?? false,
      annotations,
      fieldType,
      format: proj.format,
      constraints: { ...proj.constraints },
      enumValues: proj.enumValues,
      widget: fieldHints?.widget,
    }
    nodes[id] = node
  }

  return id
}
