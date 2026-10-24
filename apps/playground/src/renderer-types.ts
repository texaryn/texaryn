import type { FormRuntime } from '@texaryn/core'
import type { SyntheticEvent } from 'react'
import type { ResolvedTheme } from './theme.js'

export interface RendererProps {
  runtime: FormRuntime
  theme: ResolvedTheme
  onSubmit?: (event: SyntheticEvent<HTMLFormElement>) => void
  onSubmitForm?: (form: HTMLFormElement | null) => void
}
