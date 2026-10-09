export function schemaFragment(schemaUri: string): string {
  const hashIndex = schemaUri.indexOf('#')
  if (hashIndex === -1) return ''
  return decodeFragment(schemaUri.slice(hashIndex + 1))
}

export function schemaPosition(schemaUri: string, rootUri?: string): string {
  const hashIndex = schemaUri.indexOf('#')
  const resource = hashIndex === -1 ? schemaUri : schemaUri.slice(0, hashIndex)
  const fragment = hashIndex === -1 ? '' : decodeFragment(schemaUri.slice(hashIndex + 1))
  return `${resource === '' || resource === rootUri ? '' : resource}#${fragment}`
}

function decodeFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment)
  } catch {
    return fragment
  }
}

function pointerSegments(pointer: string): string[] {
  if (pointer === '') return []
  return (pointer.startsWith('/') ? pointer.slice(1) : pointer).split('/')
}

const schemaDocuments = new WeakMap<object, ReadonlyMap<string, unknown>>()
const referenceTargets = new WeakMap<object, ReadonlyMap<string, string>>()
const resourcePositions = new WeakMap<object, ReadonlyMap<string, string>>()

export function setSchemaDocumentContext(
  root: object,
  remotes: readonly unknown[],
  references: ReadonlyMap<string, string>,
  resources: ReadonlyMap<string, string>,
): void {
  const documents = new Map<string, unknown>()
  for (const remote of remotes) {
    if (typeof remote !== 'object' || remote === null || Array.isArray(remote)) continue
    const id = (remote as Record<string, unknown>).$id
    if (typeof id === 'string') documents.set(id.split('#', 1)[0]!, remote)
  }
  schemaDocuments.set(root, documents)
  referenceTargets.set(root, references)
  resourcePositions.set(root, resources)
}

export function schemaAtPosition(root: unknown, position: string): unknown {
  const hashIndex = position.indexOf('#')
  if (hashIndex > 0 && typeof root === 'object' && root !== null) {
    const resource = position.slice(0, hashIndex).split('#', 1)[0]!
    const fragment = position.slice(hashIndex + 1)
    const document = schemaDocuments.get(root)?.get(resource)
    if (document !== undefined) return resolveJsonPointer(document, fragment)
    const resourcePosition = resourcePositions.get(root)?.get(resource)
    if (resourcePosition === undefined) return undefined
    const targetHash = resourcePosition.indexOf('#')
    const targetFragment = targetHash === -1 ? '' : resourcePosition.slice(targetHash + 1)
    const combinedSegments = [...pointerSegments(targetFragment), ...pointerSegments(fragment)]
    const combinedFragment = combinedSegments.length === 0 ? '' : `/${combinedSegments.join('/')}`
    const targetResource = targetHash === -1 ? resourcePosition : resourcePosition.slice(0, targetHash)
    return schemaAtPosition(root, `${targetResource}#${combinedFragment}`)
  }
  return resolveJsonPointer(root, hashIndex === -1 ? position : position.slice(hashIndex + 1))
}

export function schemaReferenceTarget(root: unknown, position: string): string | undefined {
  if (typeof root === 'object' && root !== null) {
    const target = referenceTargets.get(root)?.get(`${position}\u0000$ref`)
    if (target !== undefined) return target
  }
  const schema = schemaAtPosition(root, position)
  if (!schema || typeof schema !== 'object' || typeof (schema as Record<string, unknown>).$ref !== 'string') return undefined
  const reference = (schema as Record<string, string>).$ref
  if (!reference.startsWith('#')) return undefined
  const hashIndex = position.indexOf('#')
  const resource = hashIndex > 0 ? position.slice(0, hashIndex) : ''
  return `${resource}#${schemaFragment(reference)}`
}

export function schemaPositionSegments(position: string): string[] {
  const hashIndex = position.indexOf('#')
  const fragment = hashIndex === -1 ? position : position.slice(hashIndex + 1)
  if (fragment === '') return []
  return fragment.replace(/^\//, '').split('/').map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
}

export function schemaParentPosition(position: string, segmentCount: number): string {
  const hashIndex = position.indexOf('#')
  const resource = hashIndex > 0 ? position.slice(0, hashIndex) : ''
  const fragment = hashIndex === -1 ? position : position.slice(hashIndex + 1)
  const segments = fragment === '' ? [] : fragment.replace(/^\//, '').split('/')
  return `${resource}#${segments.length === 0 || segmentCount === 0 ? '' : `/${segments.slice(0, segmentCount).join('/')}`}`
}

export function escapeSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

export function instancePointerFromUri(instanceUri: string): string {
  // hyperjump format: `${baseUri}#${pointer}`, e.g. "#/name" or "#" for root.
  const hashIndex = instanceUri.indexOf('#')
  const fragment = hashIndex === -1 ? '' : instanceUri.slice(hashIndex + 1)
  return fragment === '' ? '' : decodeURI(fragment)
}

export function keywordNameFromId(keywordId: string): string {
  return keywordId.slice(keywordId.lastIndexOf('/') + 1)
}

export function resolveJsonPointer(doc: unknown, pointer: string): unknown {
  if (pointer === '') return doc
  const parts = pointer
    .split('/')
    .slice(1)
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'))
  let cur: unknown = doc
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined
    if (Array.isArray(cur)) cur = (cur as unknown[])[Number(part)]
    else if (typeof cur === 'object' && Object.hasOwn(cur, part)) cur = (cur as Record<string, unknown>)[part]
    else return undefined
  }
  return cur
}
