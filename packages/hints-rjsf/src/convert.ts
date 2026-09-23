import type { ArrayHints, ChildProjection, JsonPointer, NodeProjection, SchemaProjection, UIHints } from '@texaryn/core'
import type { JsonObject, JsonValue, OutsideJson } from './json.js'
import { isJsonArray, isJsonObject, member, toJson } from './json.js'
import type { Option, Options } from './options.js'
import { GLOBAL_KEYS, GLOBAL_PATH, effectiveOptions, globalOptions, isGlobal, plain } from './options.js'
import { convertOrder } from './order.js'
import { append, appendPointer, isCanonicalIndex, isWithin, segmentsOf } from './pointer.js'
import type { KeyContext } from './table.js'
import { dispose, isInert } from './table.js'
import type { ComponentRequirement, UiSchemaIssue, UiSchemaIssueCode } from './types.js'
import type { NodeKind } from './widgets.js'
import { kindOf, widgetOutcome } from './widgets.js'

export interface UiSchemaEntry {
  readonly component?: string
  readonly options: Readonly<Record<string, JsonValue>>
  readonly uiSchema: JsonObject
}

export interface UiSchemaConversion {
  readonly hints: UIHints
  readonly components: readonly ComponentRequirement[]
  readonly issues: readonly UiSchemaIssue[]
  uiSchemaAt(pointer: JsonPointer): UiSchemaEntry | undefined
}

interface Walk {
  readonly projection: SchemaProjection
  readonly global: Options
  readonly hints: Record<string, ArrayHints>
  readonly components: ComponentRequirement[]
  readonly issues: UiSchemaIssue[]
  readonly owners: JsonPointer[]
  readonly invalidPaths: Set<string>
}

interface Component {
  readonly name: string
  readonly key: 'ui:field' | 'ui:widget'
  readonly path: string
}

interface UiLocation {
  readonly ui: JsonObject
  readonly rows: boolean
}

const ROWS = 'RJSF applies it to every row, and a Texaryn hint addresses one row.'
const NOT_A_FIELD_NAME = 'ui:field takes the name of a registered field.'
const NOT_A_WIDGET_NAME = 'ui:widget takes the name of a widget.'
const NOT_AN_OBJECT = 'A uiSchema location takes an object.'
const NOT_A_GLOBAL_OPTION =
  'RJSF types only addable, copyable, orderable, removable, label, duplicateKeySuffixSeparator and enableMarkdownInDescription as global options and applies any other key at some call sites only; set it per location.'

const GLOBAL_EFFECTS = new Map<string, readonly [JsonValue, string]>([
  ['label', [false, 'Texaryn always renders labels.']],
  ['addable', [false, 'Texaryn shows the add control until maxItems is reached.']],
  ['removable', [false, 'Texaryn shows the remove controls until minItems is reached.']],
  ['copyable', [true, 'Texaryn has no copy control.']],
  ['enableMarkdownInDescription', [true, 'Texaryn renders descriptions as plain text.']],
])

function where(pointer: JsonPointer): string {
  return pointer === '' ? 'the root' : pointer
}

function conditional(keyword: string): string {
  return `RJSF applies option i of ${keyword} only while option i is selected, which static hints cannot follow.`
}

function nodeAt(projection: SchemaProjection, pointer: JsonPointer): NodeProjection | undefined {
  const node = projection.nodes.get(pointer)
  return typeof node === 'object' && node !== null ? node : undefined
}

function childrenOf(node: NodeProjection): readonly ChildProjection[] {
  return Array.isArray(node.children) ? node.children : []
}

function report(walk: Walk, issue: UiSchemaIssue): void {
  if (issue.code === 'invalid-value') {
    if (walk.invalidPaths.has(issue.path)) return
    walk.invalidPaths.add(issue.path)
  }
  walk.issues.push(issue)
}

function hint(walk: Walk, pointer: JsonPointer, patch: ArrayHints): void {
  walk.hints[pointer] = { ...walk.hints[pointer], ...patch }
}

function componentAt(options: Options, kind: NodeKind, node?: NodeProjection): Component | undefined {
  const field = options.get('field')
  if (typeof field?.value === 'string') return { name: field.value, key: 'ui:field', path: field.path }
  const widget = options.get('widget')
  if (typeof widget?.value === 'string' && widgetOutcome(widget.value, kind, node) === 'component') {
    return { name: widget.value, key: 'ui:widget', path: widget.path }
  }
  return undefined
}

function checkShape(walk: Walk, ui: JsonObject, path: string, root: boolean, pointer?: JsonPointer): void {
  for (const key of Object.keys(ui)) {
    const value = ui[key] as JsonValue
    const at = append(path, key)
    if (key === 'ui:widget' && isJsonObject(value)) {
      report(walk, { code: 'invalid-value', key, path: at, pointer, value, message: 'RJSF drops a ui:widget object; put the options under ui:options.' })
    } else if (key === 'ui:options' && !isJsonObject(value)) {
      report(walk, { code: 'invalid-value', key, path: at, pointer, value, message: 'ui:options takes an object; RJSF reads anything else as an option named options.' })
    } else if (key === 'ui:globalOptions' && root && !isJsonObject(value)) {
      report(walk, { code: 'invalid-value', key, path: at, pointer, value, message: 'ui:globalOptions takes an object.' })
    }
  }
}

function visitSubtree(
  walk: Walk,
  value: JsonValue,
  path: string,
  key: string,
  code: UiSchemaIssueCode,
  message: string,
  pointer?: JsonPointer,
): void {
  if (isJsonArray(value)) {
    value.forEach((entry, index) => visitSubtree(walk, entry, `${path}/${index}`, String(index), code, message))
    return
  }
  if (!isJsonObject(value)) {
    report(walk, { code: 'invalid-value', key, path, pointer, value, message: NOT_AN_OBJECT })
    return
  }
  checkShape(walk, value, path, false, pointer)
  for (const [name, option] of effectiveOptions(value, path, new Map())) {
    if ((name === 'field' || name === 'widget') && typeof option.value !== 'string') {
      report(walk, {
        code: 'invalid-value',
        key: `ui:${name}`,
        path: option.path,
        pointer,
        value: option.value,
        message: name === 'field' ? NOT_A_FIELD_NAME : NOT_A_WIDGET_NAME,
      })
      continue
    }
    if (!isInert(name, option.value)) {
      report(walk, { code, key: `ui:${name}`, path: option.path, pointer, value: option.value, message })
    }
  }
  for (const name of Object.keys(value)) {
    if (!name.startsWith('ui:')) visitSubtree(walk, value[name] as JsonValue, append(path, name), name, code, message)
  }
}

function visitRows(walk: Walk, ui: JsonObject, array: JsonPointer, path: string): void {
  checkShape(walk, ui, path, false)
  const options = effectiveOptions(ui, path, walk.global)
  const component = componentAt(options, 'unknown')
  if (component) {
    walk.components.push({ ...component, pointer: array, rows: true })
    return
  }
  for (const [name, option] of options) {
    if (isGlobal(option)) continue
    if ((name === 'field' || name === 'widget') && typeof option.value !== 'string') {
      report(walk, {
        code: 'invalid-value',
        key: `ui:${name}`,
        path: option.path,
        value: option.value,
        message: name === 'field' ? NOT_A_FIELD_NAME : NOT_A_WIDGET_NAME,
      })
      continue
    }
    if (!isInert(name, option.value)) {
      report(walk, { code: 'unaddressable', key: `ui:${name}`, path: option.path, value: option.value, message: ROWS })
    }
  }
  for (const key of Object.keys(ui)) {
    if (key.startsWith('ui:')) continue
    const value = ui[key] as JsonValue
    const at = append(path, key)
    if (key === 'oneOf' || key === 'anyOf') visitSubtree(walk, value, at, key, 'conditional', conditional(key))
    else if (key === 'additionalItems' || key === 'additionalProperties' || isJsonArray(value)) {
      visitSubtree(walk, value, at, key, 'unaddressable', ROWS)
    } else if (isJsonObject(value)) visitRows(walk, value, array, at)
    else report(walk, { code: 'invalid-value', key, path: at, value, message: NOT_AN_OBJECT })
  }
}

function visitItems(walk: Walk, value: JsonValue, array: JsonPointer, path: string, readOnly: boolean): void {
  if (isJsonObject(value)) {
    visitRows(walk, value, array, path)
    return
  }
  if (!isJsonArray(value)) {
    report(walk, { code: 'invalid-value', key: 'items', path, value, message: 'items takes an object, or an array for tuple positions.' })
    return
  }
  value.forEach((entry, index) => {
    const at = `${path}/${index}`
    const row = appendPointer(array, String(index))
    if (!isJsonObject(entry)) {
      report(walk, { code: 'invalid-value', key: String(index), path: at, value: entry, message: 'A tuple position takes an object.' })
    } else if (nodeAt(walk.projection, row) !== undefined) {
      visitNode(walk, entry, row, at, readOnly, false)
    } else {
      visitSubtree(walk, entry, at, String(index), 'unaddressable', `The projection has no node at ${row}, so nothing renders there.`, row)
    }
  })
}

function visitWidget(walk: Walk, value: JsonValue, path: string, ctx: KeyContext, pointer: JsonPointer): void {
  if (typeof value !== 'string') {
    report(walk, { code: 'invalid-value', key: 'ui:widget', path, pointer, value, message: NOT_A_WIDGET_NAME })
    return
  }
  const outcome = widgetOutcome(value, ctx.kind, ctx.node)
  if (outcome === 'textarea') hint(walk, pointer, { widget: 'textarea' })
  if (outcome === 'hidden') {
    report(walk, {
      code: 'unsupported',
      key: 'ui:widget',
      path,
      pointer,
      value,
      message: 'RJSF hides the field, and Texaryn has no visibility contract, so it stays visible and editable.',
    })
  }
}

function visitOrder(walk: Walk, value: JsonValue, node: NodeProjection, path: string, pointer: JsonPointer): void {
  const result = convertOrder(value, childrenOf(node), path)
  for (const [child, order] of result.orders) hint(walk, child, { order })
  for (const found of result.issues) report(walk, { ...found, key: 'ui:order', pointer })
}

function visitOption(walk: Walk, name: string, option: Option, ctx: KeyContext, pointer: JsonPointer): void {
  const { value, path } = option
  const key = `ui:${name}`
  switch (name) {
    case 'field':
      report(walk, { code: 'invalid-value', key, path, pointer, value, message: NOT_A_FIELD_NAME })
      return
    case 'widget':
      visitWidget(walk, value, path, ctx, pointer)
      return
    case 'order':
      if (ctx.kind === 'object') visitOrder(walk, value, ctx.node, path, pointer)
      return
    case 'orderable':
    case 'globalOptions':
    case 'rootFieldId':
    case 'fieldReplacesAnyOrOneOf':
    case 'options':
      return
    default: {
      const disposition = dispose(name, value, ctx)
      if (disposition.kind === 'hint') {
        const text = value as string
        hint(walk, pointer, disposition.hint === 'placeholder' ? { placeholder: text } : { helpText: text })
      } else if (disposition.kind === 'issue') {
        report(walk, { code: disposition.code, key, path, pointer, value, message: disposition.message })
      }
    }
  }
}

function visitNesting(
  walk: Walk,
  ui: JsonObject,
  key: string,
  node: NodeProjection,
  pointer: JsonPointer,
  path: string,
  readOnly: boolean,
): void {
  const value = ui[key] as JsonValue
  const at = append(path, key)
  const kind = kindOf(node)
  const child = kind === 'object' ? childrenOf(node).find((candidate) => candidate.key === key) : undefined
  if (child) {
    if (isJsonObject(value)) visitNode(walk, value, child.pointer, at, readOnly, false)
    else report(walk, { code: 'invalid-value', key, path: at, pointer: child.pointer, value, message: NOT_AN_OBJECT })
    return
  }
  if (kind === 'array' && key === 'items') {
    visitItems(walk, value, pointer, at, readOnly)
  } else if (kind === 'array' && key === 'additionalItems') {
    visitSubtree(walk, value, at, key, 'unaddressable', 'RJSF applies it to rows past the tuple positions, and Texaryn projects none.')
  } else if (kind === 'object' && key === 'additionalProperties') {
    visitSubtree(walk, value, at, key, 'unaddressable', 'RJSF applies it to properties the data adds, and Texaryn projects no node for them.')
  } else if (key === 'oneOf' || key === 'anyOf') {
    if (isJsonArray(value)) visitSubtree(walk, value, at, key, 'conditional', conditional(key))
    else report(walk, { code: 'invalid-value', key, path: at, value, message: `RJSF reads ${key} as an array of option uiSchemas.` })
  } else if (key === 'classNames') {
    report(walk, { code: 'unsupported', key, path: at, pointer, value, message: 'Texaryn has no styling hook per location; style the widget registered for it.' })
  } else {
    report(walk, {
      code: 'unknown-location',
      key,
      path: at,
      pointer,
      message: `No child named ${key} is projected at ${where(pointer)}: either a typo, which RJSF ignores too, or a property the schema declares that this port does not project.`,
    })
  }
}

function visitNode(walk: Walk, ui: JsonObject, pointer: JsonPointer, path: string, inherited: boolean, root: boolean): void {
  const node = nodeAt(walk.projection, pointer)
  if (!node) {
    visitSubtree(walk, ui, path, '', 'unaddressable', `The projection has no node at ${where(pointer)}, so nothing renders there.`, pointer)
    return
  }
  checkShape(walk, ui, path, root, pointer)
  const kind = kindOf(node)
  const readOnly = inherited || node.annotations?.readOnly === true
  const options = effectiveOptions(ui, path, walk.global)
  const component = componentAt(options, kind, node)
  if (component) {
    walk.components.push({ ...component, pointer, rows: false })
    walk.owners.push(pointer)
    return
  }
  for (const [name, option] of options) {
    if (!isGlobal(option)) visitOption(walk, name, option, { kind, node, options, readOnly, root }, pointer)
  }
  for (const key of Object.keys(ui)) {
    if (!key.startsWith('ui:')) visitNesting(walk, ui, key, node, pointer, path, readOnly)
  }
}

function visitGlobal(walk: Walk, root: JsonObject): void {
  const raw = member(root, 'ui:globalOptions')
  if (!isJsonObject(raw)) return
  for (const key of Object.keys(raw)) {
    const value = raw[key] as JsonValue
    const path = append(GLOBAL_PATH, key)
    if (!GLOBAL_KEYS.has(key)) {
      report(walk, { code: 'unsupported', key: `ui:${key}`, path, value, message: NOT_A_GLOBAL_OPTION })
      continue
    }
    const effect = GLOBAL_EFFECTS.get(key)
    if (effect && value === effect[0]) {
      report(walk, { code: 'unsupported', key: `ui:${key}`, path, value, message: effect[1] })
    }
  }
}

function uiObjectAt(root: JsonObject, projection: SchemaProjection, pointer: string): UiLocation | undefined {
  const segments = segmentsOf(pointer)
  if (!segments) return undefined
  let ui = root
  let at = ''
  let rows = false
  for (const segment of segments) {
    const node = nodeAt(projection, at as JsonPointer)
    const items = member(ui, 'items')
    const list = node ? node.type === 'array' : items !== undefined && member(ui, segment) === undefined
    let next: JsonValue | undefined
    if (list) {
      next = !isCanonicalIndex(segment) ? undefined : isJsonArray(items) ? items[Number(segment)] : items
      if (!isJsonArray(items)) rows = true
    } else {
      next = segment.startsWith('ui:') ? undefined : member(ui, segment)
    }
    if (!isJsonObject(next)) return undefined
    ui = next
    at = append(at, segment)
  }
  return { ui, rows }
}

function reorderDefaults(walk: Walk, root: JsonObject): void {
  const visited = new Set<JsonPointer>()
  const visit = (pointer: JsonPointer): void => {
    if (visited.has(pointer)) return
    visited.add(pointer)
    const node = nodeAt(walk.projection, pointer)
    if (!node || walk.owners.some((owner) => isWithin(pointer, owner))) return
    if (node.type === 'array') {
      const located = uiObjectAt(root, walk.projection, pointer)
      const options = located ? effectiveOptions(located.ui, '', walk.global) : walk.global
      hint(walk, pointer, { canReorder: options.get('orderable')?.value !== false })
    } else if (node.type === 'object') {
      for (const child of childrenOf(node)) visit(child.pointer)
    }
  }
  visit('' as JsonPointer)
}

function entryAt(root: JsonObject, projection: SchemaProjection, global: Options, pointer: string): UiSchemaEntry | undefined {
  const located = uiObjectAt(root, projection, pointer)
  if (!located) return undefined
  const node = nodeAt(projection, pointer as JsonPointer)
  const kind = located.rows ? 'unknown' : kindOf(node)
  const options = effectiveOptions(located.ui, '', global)
  const component = componentAt(options, kind, located.rows ? undefined : node)
  return { ...(component ? { component: component.name } : {}), options: plain(options), uiSchema: located.ui }
}

function normalizeProjection(projection: SchemaProjection): SchemaProjection {
  try {
    return projection?.nodes instanceof Map ? projection : { nodes: new Map() }
  } catch {
    return { nodes: new Map() }
  }
}

export function fromUiSchema(uiSchema: unknown, projection: SchemaProjection): UiSchemaConversion {
  const outside: OutsideJson[] = []
  const json = uiSchema === undefined ? {} : toJson(uiSchema, outside)
  const root: JsonObject = isJsonObject(json) ? json : {}
  const walk: Walk = {
    projection: normalizeProjection(projection),
    global: globalOptions(root),
    hints: {},
    components: [],
    issues: [],
    owners: [],
    invalidPaths: new Set(),
  }
  for (const found of outside) {
    report(walk, { code: 'invalid-value', key: found.key, path: found.path, message: `Outside the JSON-serializable profile: ${found.reason}.` })
  }
  if (json !== undefined && !isJsonObject(json)) {
    report(walk, { code: 'invalid-value', key: '', path: '', value: json, message: 'A uiSchema is an object.' })
  }
  const rootNode = nodeAt(walk.projection, '' as JsonPointer)
  const rootOptions = effectiveOptions(root, '', walk.global)
  const rootComponent = rootNode ? componentAt(rootOptions, kindOf(rootNode), rootNode) : undefined
  if (!rootComponent) visitGlobal(walk, root)
  visitNode(walk, root, '' as JsonPointer, '', false, true)
  reorderDefaults(walk, root)
  const entries = new Map<string, UiSchemaEntry | undefined>()
  return {
    hints: walk.hints,
    components: walk.components,
    issues: walk.issues,
    uiSchemaAt(pointer) {
      if (typeof pointer !== 'string') return undefined
      if (!entries.has(pointer)) entries.set(pointer, entryAt(root, walk.projection, walk.global, pointer))
      return entries.get(pointer)
    },
  }
}
