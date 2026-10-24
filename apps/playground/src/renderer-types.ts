import type { FormRuntime } from '@texaryn/core'
import type { FormEventHandler } from 'react'
import type { ResolvedTheme } from './theme.js'

export interface RendererProps {
  runtime: FormRuntime
  theme: ResolvedTheme
  onSubmit?: FormEventHandler<HTMLFormElement>
  onSubmitForm?: (form: HTMLFormElement | null) => void
}
