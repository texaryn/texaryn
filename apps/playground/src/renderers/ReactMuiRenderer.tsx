import { FormRoot } from '@texaryn/react'
import { createMuiRegistry } from '@texaryn/react-mui'
import { MuiThemeBoundary } from '../MuiThemeBoundary.js'
import type { RendererProps } from '../renderer-types.js'

const registry = createMuiRegistry()

export default function ReactMuiRenderer({ theme }: RendererProps) {
  return (
    <MuiThemeBoundary theme={theme}>
      <FormRoot registry={registry} />
    </MuiThemeBoundary>
  )
}
