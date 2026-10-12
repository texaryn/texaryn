import { For, Show } from 'solid-js'
import type { ValidationError } from '@texaryn/core'
import { useFormContext } from '../context.js'

export function FieldErrors(props: { id: string; errors: readonly ValidationError[] }) {
  const context = useFormContext()
  return (
    <div id={props.id} aria-live="polite" aria-atomic="true">
      <Show when={props.errors.length > 0}>
        <ul>
          <For each={props.errors}>{(error) => <li>{context.messages().validationMessage(error)}</li>}</For>
        </ul>
      </Show>
    </div>
  )
}
