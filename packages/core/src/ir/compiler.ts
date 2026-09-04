import type {
  SchemaProjection,
  NodeProjection,
  ChildProjection,
} from '../schema/port.js'
import type {
  UINode,
  FieldNode,
  FieldType,
  ContainerNode,
  ArrayMeta,
  NodeAnnotations,
} from './types.js'
import type { CompileResult } from './compiler-types.js'
import type { UIHints, ArrayHints, FieldHints } from '../hints/types.js'
import type { IdentityMap } from './runtime-state.js'
import type { JsonPointer, NodeId, StableItemId } from '../types.js'
import { createIdentityMap, registerArray, insertItem } from '../identity/index.js'
import { getAtPointer } from '../json-pointer.js'

interface CompileContext {
  nodes: Record<string, UINode>
  identityMap: IdentityMap
  nodeCounter: number
}

function nextId(ctx: CompileContext): NodeId {
  return `node_${++ctx.nodeCounter}` as NodeId
}

function siblingOrder(
  hints: UIHints | undefined,
  pointer: JsonPointer,
  schemaIndex: number,
): number {
  return (hints?.[pointer] as FieldHints | undefined)?.order ?? schemaIndex
}

/**
 * Compiles a projection into a document.
 *
 * `identities` carries array item identity forward from the previous
 * document. The command handler owns identity: it maintains it directly for
 * insert, remove and move, and reconciles it whenever data changes. Passing
 * that map back in lets compilation adopt the result. Omitting it mints a
 * fresh positional identity, which is only correct for a first compile.
 */
export function compile(
  projection: SchemaProjection,
  data: unknown,
  hints?: UIHints,
  identities?: IdentityMap,
): CompileResult {
  const nodes: Record<string, UINode> = {}
  const identityMap = identities ?? createIdentityMap()

  const rootProjection = projection.nodes.get('' as JsonPointer)
  if (!rootProjection) {
    throw new Error('Schema projection missing root node')
  }

  const ctx: CompileContext = { nodes, identityMap, nodeCounter: 0 }
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
  required?: boolean,
): NodeId {
  const { nodes } = ctx
  const id = nextId(ctx)

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
      // Presentation order among siblings, and nothing more. An explicit
      // `order` hint wins; a field without one keeps its schema position, so
      // ordering a single field does not displace everything after it. Equal
      // values keep schema order, which makes the result deterministic rather
      // than dependent on sort stability. Array items are excluded: their
      // order is their data order.
      const ordered = proj.children
        .map((child, schemaIndex) => ({ child, schemaIndex }))
        .sort((a, b) => {
          const aOrder = siblingOrder(hints, a.child.pointer, a.schemaIndex)
          const bOrder = siblingOrder(hints, b.child.pointer, b.schemaIndex)
          return aOrder - bOrder || a.schemaIndex - b.schemaIndex
        })

      for (let i = 0; i < ordered.length; i++) {
        const child: ChildProjection = ordered[i].child
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
            child.required,
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

    // Adopt the identity the handler already maintains for this array. It
    // reconciles on data changes and updates the map directly for insert,
    // remove and move, so regenerating here would discard that work and hand
    // renderers positional ids: removing the first of two rows would move the
    // survivor from item_1 to item_0, detaching whatever state a renderer had
    // keyed to it.
    //
    // Identity map API is pure: register/insert return new maps, so we always
    // reassign ctx.identityMap rather than mutate in place.
    const carried = ctx.identityMap.arrayIdentities.get(id)
    let itemStableIds: StableItemId[]

    if (carried !== undefined && carried.length === arrayItems.length) {
      itemStableIds = [...carried]
    } else {
      // No identity yet for this array, or a count the handler did not
      // produce. Minting positional ids is right for a first compile and is
      // the only safe fallback otherwise: reconciling here would be a second
      // identity system competing with the handler's.
      ctx.identityMap = registerArray(ctx.identityMap, id)
      itemStableIds = []
      for (let i = 0; i < arrayItems.length; i++) {
        const result = insertItem(ctx.identityMap, id, i)
        ctx.identityMap = result.map
        itemStableIds.push(result.itemId)
      }
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
          false,
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
      constraints: { ...proj.constraints, required: required ?? proj.constraints.required ?? false },
      enumValues: proj.enumValues,
      widget: fieldHints?.widget,
      placeholder: fieldHints?.placeholder,
      helpText: fieldHints?.helpText,
    }
    nodes[id] = node
  }

  return id
}
