import { For, Match, Show, Switch, createMemo } from 'solid-js'
import type { FieldNode, UINode } from '@texaryn/core'
import { FieldErrors } from '../components/FieldErrors.js'
import { createFieldBinding } from '../field.js'

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => sameJsonValue(value, right[index]))
  }

  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const keys = Object.keys(leftRecord)
  return keys.length === Object.keys(rightRecord).length &&
    keys.every((key) => Object.hasOwn(rightRecord, key) && sameJsonValue(leftRecord[key], rightRecord[key]))
}

export function FieldWidget(props: { node: UINode }) {
  const field = createFieldBinding(() => props.node.id)
  const current = createMemo(() => field.node())
  const optionIndex = createMemo(() => {
    const options = current()?.enumValues ?? []
    const selected = field.value()
    return String(options.findIndex((option) => sameJsonValue(option.value, selected)))
  })
  const inputProps = () => ({
    id: field.inputId(),
    name: current()?.dataPointer || current()?.id || '',
    disabled: field.disabled() || Boolean(current()?.disabled),
    'aria-required': Boolean(current()?.constraints.required),
    'aria-invalid': field.invalid() || undefined,
    'aria-describedby': field.describedBy(),
    placeholder: current()?.placeholder,
  })
  const onTextInput = (event: InputEvent & { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
    field.setRaw(event.currentTarget.value)
  }

  return (
    <Show when={field.visible() && current()}>
      {(node) => <div>
        <label for={field.inputId()}>
          {field.label()}
          <Show when={node().constraints.required}><span> (required)</span></Show>
        </label>
        <Switch>
          <Match when={node().enumValues?.length}>
            <select
              {...inputProps()}
              value={optionIndex()}
              aria-readonly={node().readOnly ? 'true' : undefined}
              onChange={(event) => {
                if (node().readOnly) {
                  event.currentTarget.value = optionIndex()
                  return
                }
                field.setRaw('', event.currentTarget.value)
              }}
              onBlur={field.onBlur}
            >
              <For each={node().enumValues}>{(option, index) => (
                <option value={String(index())}>{option.title ?? String(option.value)}</option>
              )}</For>
            </select>
          </Match>
          <Match when={node().fieldType === 'boolean'}>
            <input
              {...inputProps()}
              type="checkbox"
              checked={Boolean(field.value())}
              aria-readonly={node().readOnly ? 'true' : undefined}
              onChange={(event) => {
                if (node().readOnly) {
                  event.currentTarget.checked = Boolean(field.value())
                  return
                }
                field.setValue(event.currentTarget.checked)
              }}
              onBlur={field.onBlur}
            />
          </Match>
          <Match when={node().widget === 'textarea'}>
            <textarea
              {...inputProps()}
              value={field.display()}
              readOnly={node().readOnly}
              onInput={onTextInput}
              onBlur={field.onBlur}
            />
          </Match>
          <Match when={true}>
            <input
              {...inputProps()}
              type={node().fieldType === 'number' || node().fieldType === 'integer' ? 'number' : 'text'}
              value={field.display()}
              readOnly={node().readOnly}
              onInput={onTextInput}
              onBlur={field.onBlur}
            />
          </Match>
        </Switch>
        <Show when={field.description()}>
          <div id={field.descriptionId()}>{field.description()}</div>
        </Show>
        <FieldErrors id={field.errorId()} errors={field.visibleErrors()} />
      </div>}
    </Show>
  )
}
