export function schemaFragment(schemaUri: string): string {
  const hashIndex = schemaUri.indexOf('#')
  if (hashIndex === -1) return ''
  return decodeURI(schemaUri.slice(hashIndex + 1))
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
    cur = Array.isArray(cur)
      ? (cur as unknown[])[Number(part)]
      : (cur as Record<string, unknown>)[part]
  }
  return cur
}
