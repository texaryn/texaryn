import { compileSchema, isSchemaNode, type SchemaNode } from 'json-schema-library'
import type { Dialect } from './dialect.js'

const TESTED = 'json-schema-library 11.6.2'

type Registry = Record<string, SchemaNode>

function registryOf(root: SchemaNode): Registry {
  const context = (root as unknown as { context?: unknown }).context
  if (typeof context !== 'object' || context === null) fail('the compiled root has no "context"')
  const { refs, rootNode } = context as { refs?: unknown; rootNode?: unknown }
  if (rootNode !== root) fail('"context.rootNode" is not the compiled root')
  if (typeof refs !== 'object' || refs === null || Object.getPrototypeOf(refs) !== Object.prototype) {
    fail('"context.refs" is not a plain object')
  }
  return refs as Registry
}

// "$ref": "#" normalises to the root's base URI without its fragment, empty for an anonymous root.
function rootKey(root: SchemaNode): string {
  const id = (root as { $id?: unknown }).$id
  if (id === undefined) return ''
  if (typeof id !== 'string') fail('the compiled root has a non-string "$id"')
  return id.replace(/#.*$/, '')
}

function fail(reason: string): never {
  throw new Error(
    `@texaryn/schema-json: json-schema-library's reference registry is not shaped as in ${TESTED} ` +
      `(${reason}). The Draft 7 adapter keeps each registry entry compiled for its own location ` +
      `fixed, because that release overwrites entries during reductions and a "$ref" then resolves ` +
      `to a reduced copy; without the fix Draft 7 validation is wrong, so the adapter refuses to start.`,
  )
}

function pin(refs: Registry, key: string, node: SchemaNode): void {
  Object.defineProperty(refs, key, { get: () => node, set: () => {}, enumerable: true, configurable: true })
}

function pinRegistry(root: SchemaNode): void {
  const refs = registryOf(root)
  const key = rootKey(root)
  const descriptor = Object.getOwnPropertyDescriptor(refs, key)
  if (!descriptor) fail(`no entry for the root key ${JSON.stringify(key)}`)
  if (!('value' in descriptor) || !descriptor.writable || !descriptor.configurable) {
    fail(`the entry for ${JSON.stringify(key)} is not a writable data property`)
  }
  if (!isSchemaNode(descriptor.value)) fail(`the entry for ${JSON.stringify(key)} is not a schema node`)
  pin(refs, key, root)
  // The parser also files a node under its path from an ancestor, and compiling that location later corrects it.
  for (const [other, node] of Object.entries(refs)) {
    if (isSchemaNode(node) && other === `${key}${node.evaluationPath}`) pin(refs, other, node)
  }
}

let verified = false

// A release that keeps the registry's shape but changes what the pin repairs must also fail closed.
function selfTest(): void {
  if (verified) return
  const anonymous = compileSchema(
    { type: 'object', properties: { name: { type: 'string' }, child: { $ref: '#' } } },
    { draft: 'draft-07' },
  )
  const child = anonymous.properties?.child as SchemaNode | undefined
  if (child?.$ref !== '') fail('"$ref": "#" no longer normalises to the empty key')
  pinRegistry(anonymous)
  anonymous.reduceNode({})
  if (anonymous.validate({ child: 'text' }).valid) fail('an anonymous "#" does not resolve to the root')
  if (!anonymous.validate({ child: {} }).valid) fail('an anonymous "#" rejects a valid instance')

  const identified = compileSchema(
    {
      $id: 'https://texaryn.invalid/probe',
      type: 'object',
      properties: { x: { type: 'number' }, child: { $ref: '#' } },
      if: { required: ['x'] },
      then: { required: ['y'] },
    },
    { draft: 'draft-07' },
  )
  pinRegistry(identified)
  identified.reduceNode({})
  if (identified.validate({ child: { x: 1 } }).valid) fail('an identified "#" does not resolve to the root')
  verified = true
}

// Draft 7 only: the 2019-09 and 2020-12 parsers register an entry once and never overwrite it.
export function fixRootReference(root: SchemaNode, dialect: Dialect): void {
  if (dialect !== 'draft-07') return
  selfTest()
  pinRegistry(root)
}
