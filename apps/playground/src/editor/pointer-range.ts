import type { SyntaxNode, Tree } from '@lezer/common'

export interface TextRange {
  from: number
  to: number
}

function unescapeSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~')
}

function readName(doc: string, node: SyntaxNode): string | null {
  try {
    return JSON.parse(doc.slice(node.from, node.to)) as string
  } catch {
    return null
  }
}

function childValue(doc: string, node: SyntaxNode, segment: string): SyntaxNode | null {
  if (node.name === 'Object') {
    for (let property = node.firstChild; property; property = property.nextSibling) {
      if (property.name !== 'Property') continue
      const name = property.getChild('PropertyName')
      const value = property.lastChild
      if (name && value && value !== name && readName(doc, name) === segment) return value
    }
    return null
  }
  if (node.name === 'Array') {
    if (!/^(0|[1-9]\d*)$/.test(segment)) return null
    const index = Number(segment)
    let seen = 0
    for (let item = node.firstChild; item; item = item.nextSibling) {
      if (item.name === '[' || item.name === ']' || item.name === ',' || item.type.isError) continue
      if (seen === index) return item
      seen += 1
    }
  }
  return null
}

export function rangeForPointer(tree: Tree, doc: string, pointer: string): TextRange {
  let node = tree.topNode.firstChild
  if (!node) return { from: 0, to: 0 }
  const segments = pointer === '' ? [] : pointer.split('/').slice(1).map(unescapeSegment)
  for (const segment of segments) {
    const next = childValue(doc, node, segment)
    if (!next) break
    node = next
  }
  if (node.name === 'Object' || node.name === 'Array') {
    const lineEnd = doc.indexOf('\n', node.from)
    return { from: node.from, to: lineEnd === -1 ? node.to : Math.min(node.to, lineEnd) }
  }
  return { from: node.from, to: node.to }
}
