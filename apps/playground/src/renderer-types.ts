import type { FormRuntime } from '@texaryn/core'
import type { FormEvent } from 'react'
import type { ResolvedTheme } from './theme.js'

export interface RendererProps {
  runtime: FormRuntime
  theme: ResolvedTheme
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  onSubmitForm?: (form: HTMLFormElement | null) => void
}
