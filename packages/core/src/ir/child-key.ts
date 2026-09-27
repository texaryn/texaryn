import type { UINode } from './types.js'

/** The key a binding gives an object's child: its property name, which a recompile that renumbers node ids keeps. */
export function objectChildKey(node: UINode): string {
  const pointer = node.dataPointer
  if (pointer == null) return node.id
  return pointer.slice(pointer.lastIndexOf('/') + 1)
}
