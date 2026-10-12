import { FormRoot } from '@texaryn/react'
import { createBootstrapRegistry } from '@texaryn/react-bootstrap'
import { BootstrapBoundary } from '../BootstrapBoundary.js'
import type { RendererProps } from '../renderer-types.js'

const registry = createBootstrapRegistry()

export default function ReactBootstrapRenderer({ theme }: RendererProps) {
  return (
    <BootstrapBoundary theme={theme}>
      <FormRoot registry={registry} />
    </BootstrapBoundary>
  )
}
