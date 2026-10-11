import { For, Show } from 'solid-js'
import type { ValidationError } from '@texaryn/core'

export function FieldErrors(props: { id: string; errors: readonly ValidationError[] }) {
  return (
    <div id={props.id} aria-live="polite" aria-atomic="true">
      <Show when={props.errors.length > 0}>
        <ul>
          <For each={props.errors}>{(error) => <li>{error.message ?? error.keyword}</li>}</For>
        </ul>
      </Show>
    </div>
  )
}
