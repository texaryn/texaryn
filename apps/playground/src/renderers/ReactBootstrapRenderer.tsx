import { ErrorSummary, FormRoot } from '@texaryn/react'
import { createBootstrapRegistry } from '@texaryn/react-bootstrap'
import { BootstrapBoundary } from '../BootstrapBoundary.js'
import type { RendererProps } from '../renderer-types.js'

const registry = createBootstrapRegistry()

export default function ReactBootstrapRenderer({ theme, onSubmit }: RendererProps) {
  return (
    <BootstrapBoundary theme={theme}>
      <form className="pg-runtime-form" noValidate onSubmit={onSubmit}>
        <ErrorSummary />
        <FormRoot registry={registry} />
        <button
          type="submit"
          aria-hidden="true"
          tabIndex={-1}
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        />
      </form>
    </BootstrapBoundary>
  )
}
