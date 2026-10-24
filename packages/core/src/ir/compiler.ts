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
import { identityKey } from '../identity/key.js'
import type { IdentityKey, IdentitySegment } from '../identity/key.js'
import { getAtPointer } from '../json-pointer.js'

interface CompileContext {
  nodes: Record<string, UINode>
  projection: SchemaProjection
  data: unknown
  hints: UIHints | undefined
  identityMap: IdentityMap
  nodeCounter: number
  visited: Set<IdentityKey>
}

interface CompileNodeOptions {
  pointer: JsonPointer
  proj: NodeProjection
  parentId: NodeId | null
  order: number
  required: boolean | undefined
  segments: readonly IdentitySegment[]
  inheritedReadOnly: boolean
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

  const ctx: CompileContext = {
    nodes,
    projection,
    data,
    hints,
    identityMap,
    nodeCounter: 0,
    visited: new Set(),
  }
  const rootId = compileNode({
    pointer: '' as JsonPointer,
    proj: rootProjection,
    parentId: null,
    order: 0,
    required: undefined,
    segments: [],
    inheritedReadOnly: false,
  }, ctx)

  return {
    document: { version: 1, rootId, nodes },
    identityMap: retainVisited(ctx.identityMap, ctx.visited),
  }
}

/**
 * Only the arrays this compile visited keep identity. An array whose pointer
 * left the document starts fresh when it returns, and because this builds a
 * new map rather than editing the input, a compile that throws leaves the
 * previous state untouched.
 */
function retainVisited(map: IdentityMap, visited: Set<IdentityKey>): IdentityMap {
  const arrayIdentities = new Map([...map.arrayIdentities].filter(([key]) => visited.has(key)))
  const itemLookup = new Map(
    [...map.itemLookup].filter(([, entry]) => visited.has(entry.containerKey)),
  )
  return { ...map, arrayIdentities, itemLookup }
}

/**
 * Whether a renderer should show the node.
 *
 * `active` is what JSON Schema evaluation says; `provisional` is what the
 * projection selected for the user to complete. A form has to show either, and
 * the two are kept apart on the port because they are different facts. This is
 * where they collapse into the one the IR carries.
 */
function isExposed(proj: NodeProjection): boolean {
  return proj.active || proj.provisional === true
}

function compileNode(options: CompileNodeOptions, ctx: CompileContext): NodeId {
  const { pointer, proj, parentId, order, required, inheritedReadOnly } = options
  const id = nextId(ctx)
  // Editing a descendant changes the ancestor's value, so a read-only object
  // or array makes everything beneath it read-only too.
  const readOnly = inheritedReadOnly || proj.annotations.readOnly === true
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
    compileObjectNode(options, ctx, id, readOnly, annotations)
  } else if (proj.type === 'array') {
    compileArrayNode(options, ctx, id, readOnly, annotations)
  } else {
    const fieldHints = ctx.hints?.[pointer]
    const fieldType: FieldType = proj.type === 'null' ? 'string' : proj.type
    const node: FieldNode = {
      id,
      type: 'field',
      parentId,
      dataPointer: pointer,
      order,
      visible: isExposed(proj),
      disabled: false,
      readOnly,
      annotations,
      fieldType,
      format: proj.format,
      constraints: { ...proj.constraints, required: required ?? proj.constraints.required ?? false },
      enumValues: proj.enumValues,
      widget: fieldHints?.widget,
      placeholder: fieldHints?.placeholder,
      helpText: fieldHints?.helpText,
    }
    ctx.nodes[id] = node
  }

  return id
}

function compileObjectNode(
  options: CompileNodeOptions,
  ctx: CompileContext,
  id: NodeId,
  readOnly: boolean,
  annotations: NodeAnnotations,
): void {
  const { pointer, proj, parentId, order } = options
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
        const aOrder = siblingOrder(ctx.hints, a.child.pointer, a.schemaIndex)
        const bOrder = siblingOrder(ctx.hints, b.child.pointer, b.schemaIndex)
        return aOrder - bOrder || a.schemaIndex - b.schemaIndex
      })

    for (let i = 0; i < ordered.length; i++) {
      const child: ChildProjection = ordered[i].child
      const childProj = ctx.projection.nodes.get(child.pointer)
      if (childProj) {
        const childId = compileNode({
          pointer: child.pointer,
          proj: childProj,
          parentId: id,
          order: i,
          required: child.required || child.provisionalRequired === true,
          segments: [...options.segments, { kind: 'property', name: child.key }],
          inheritedReadOnly: readOnly,
        }, ctx)
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
    visible: isExposed(proj),
    ...(proj.boundaries ? { boundaries: proj.boundaries } : {}),
    ...(proj.boundaryTargets ? { boundaryTargets: proj.boundaryTargets } : {}),
    disabled: false,
    readOnly,
    annotations,
    children,
  }
  ctx.nodes[id] = node
}

function compileArrayNode(
  options: CompileNodeOptions,
  ctx: CompileContext,
  id: NodeId,
  readOnly: boolean,
  annotations: NodeAnnotations,
): void {
  const { pointer, proj, parentId, order } = options
  const children: NodeId[] = []
  const items = getAtPointer(ctx.data, pointer)
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
  const key = identityKey(options.segments)
  ctx.visited.add(key)
  const carried = ctx.identityMap.arrayIdentities.get(key)
  let itemStableIds: StableItemId[]

  if (carried?.length === arrayItems.length) {
    itemStableIds = [...carried]
  } else {
    // No identity yet for this array, or a count the handler did not
    // produce. Minting positional ids is right for a first compile and is
    // the only safe fallback otherwise: reconciling here would be a second
    // identity system competing with the handler's.
    ctx.identityMap = registerArray(ctx.identityMap, key)
    itemStableIds = []
    for (let i = 0; i < arrayItems.length; i++) {
      const result = insertItem(ctx.identityMap, key, i)
      ctx.identityMap = result.map
      itemStableIds.push(result.itemId)
    }
  }

  for (let i = 0; i < arrayItems.length; i++) {
    const itemPointer = `${pointer}/${i}` as JsonPointer
    const itemProj = ctx.projection.nodes.get(itemPointer)
    if (itemProj) {
      const childId = compileNode({
        pointer: itemPointer,
        proj: itemProj,
        parentId: id,
        order: i,
        required: false,
        segments: [...options.segments, { kind: 'item', id: itemStableIds[i] }],
        inheritedReadOnly: readOnly,
      }, ctx)
      children.push(childId)
    }
  }

  const arrayHints = ctx.hints?.[pointer] as ArrayHints | undefined
  const arrayMeta: ArrayMeta = {
    itemIds: itemStableIds,
    identityKey: key,
    itemKey: arrayHints?.itemKey,
    itemTitle: proj.itemAnnotations?.title,
    minItems: proj.constraints.minItems,
    maxItems: proj.constraints.maxItems,
    canAdd:
      !readOnly &&
      (proj.constraints.maxItems == null || arrayItems.length < proj.constraints.maxItems),
    canRemove:
      !readOnly &&
      (proj.constraints.minItems == null || arrayItems.length > proj.constraints.minItems),
    canReorder: !readOnly && (arrayHints?.canReorder ?? false),
  }

  const node: ContainerNode = {
    id,
    type: 'container',
    containerType: 'array',
    parentId,
    dataPointer: pointer,
    order,
    visible: isExposed(proj),
    disabled: false,
    readOnly,
    annotations,
    children,
    arrayMeta,
  }
  ctx.nodes[id] = node
}
