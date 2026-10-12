import type { FormRuntime } from '@texaryn/core'
import type { ResolvedTheme } from './theme.js'

export interface RendererProps {
  runtime: FormRuntime
  theme: ResolvedTheme
}
