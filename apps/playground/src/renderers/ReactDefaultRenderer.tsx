import { FormRoot, createDefaultRegistry } from '@texaryn/react'
import type { RendererProps } from '../renderer-types.js'

const registry = createDefaultRegistry()

export default function ReactDefaultRenderer(_props: RendererProps) {
  return <FormRoot registry={registry} />
}
