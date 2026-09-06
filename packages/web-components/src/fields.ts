import type { FieldNode, UINode } from '@texaryn/core'
import { FieldState } from './field-state.js'
import { makeId } from './ids.js'
import type { DomWidget, RenderContext } from './widget.js'

type Kind = 'string' | 'number' | 'boolean' | 'enum' | 'textarea'
type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

/** Mirrors the Vue binding's coerce so both renderers write the same data for the same keystrokes. */
function coerce(kind: Kind, node: FieldNode, raw: string): unknown {
  if (kind === 'number') return raw === '' ? undefined : Number(raw)
  if (kind === 'enum') {
    const option = (node.enumValues ?? []).find((o) => String(o.value) === raw)
    return option ? option.value : raw
  }
  return raw
}

function display(value: unknown): string {
  return value == null ? '' : String(value)
}

function createControl(kind: Kind): Control {
  if (kind === 'enum') return document.createElement('select')
  if (kind === 'textarea') return document.createElement('textarea')
  const input = document.createElement('input')
  input.type = kind === 'boolean' ? 'checkbox' : kind === 'number' ? 'number' : 'text'
  return input
}

/**
 * Label, control, description and error block for one field, on native
 * elements. Ids carry the instance prefix and the node id; both are rewritten
 * on update because a moved row keeps this widget and changes its node.
 */
function fieldWidget(kind: Kind, initial: UINode, ctx: RenderContext): DomWidget {
  let node = initial as FieldNode
  const root = document.createElement('div')
  root.className = 'texaryn-field'
  const label = document.createElement('label')
  const control = createControl(kind)
  const description = document.createElement('div')
  const errors = document.createElement('div')
  errors.setAttribute('role', 'alert')
  root.append(label, control, description, errors)

  const state = new FieldState(ctx.runtime, node, () => render())

  const commit = (): void => {
    // Read the node at event time, never captured: a stale id after a move
    // would write into the row that took this one's place.
    if (node.readOnly) {
      // The runtime refuses the write anyway. Re-rendering puts the control
      // back, which native readonly does for a text field but not for a
      // select or a checkbox the user just toggled.
      render()
      return
    }
    const value =
      control instanceof HTMLInputElement && kind === 'boolean'
        ? control.checked
        : coerce(kind, node, control.value)
    ctx.runtime.dispatch({ type: 'SetValue', nodeId: node.id, value })
  }
  control.addEventListener(kind === 'boolean' || kind === 'enum' ? 'change' : 'input', commit)
  control.addEventListener('blur', () => {
    ctx.runtime.dispatch({ type: 'SetTouched', nodeId: node.id })
  })

  function renderIds(): void {
    const inputId = makeId(ctx.idPrefix, node.id, 'input')
    control.id = inputId
    control.name = node.dataPointer || node.id
    label.htmlFor = inputId
    label.id = makeId(ctx.idPrefix, node.id, 'label')
    description.id = makeId(ctx.idPrefix, node.id, 'description')
    errors.id = makeId(ctx.idPrefix, node.id, 'error')
  }

  function renderOptions(): void {
    if (!(control instanceof HTMLSelectElement)) return
    const wanted = [{ value: '', title: '' }].concat(
      (node.enumValues ?? []).map((o) => ({ value: String(o.value), title: o.title ?? String(o.value) })),
    )
    const current = Array.from(control.options).map((o) => o.value)
    if (wanted.map((w) => w.value).join(' ') === current.join(' ')) return
    control.replaceChildren(
      ...wanted.map((w) => {
        const option = document.createElement('option')
        option.value = w.value
        option.textContent = w.title
        return option
      }),
    )
  }

  function render(): void {
    label.textContent = node.annotations.title ?? node.dataPointer ?? node.id
    renderOptions()
    const value = state.value
    if (control instanceof HTMLInputElement && kind === 'boolean') {
      control.checked = value === true
    } else {
      // Only write when the DOM disagrees: writing an equal value moves the
      // caret in real browsers, and the DOM already holds what was typed.
      const text = display(value)
      if (control.value !== text) control.value = text
    }
    control.disabled = state.disabled
    // Native readonly covers text and number; a select or checkbox can only
    // say so through ARIA, and is put back by commit above.
    if (control instanceof HTMLInputElement && kind !== 'boolean') control.readOnly = node.readOnly
    if (node.readOnly && (kind === 'boolean' || kind === 'enum')) {
      control.setAttribute('aria-readonly', 'true')
    } else {
      control.removeAttribute('aria-readonly')
    }
    if (node.placeholder && !(control instanceof HTMLSelectElement)) control.placeholder = node.placeholder
    if (node.constraints.required) control.setAttribute('aria-required', 'true')
    else control.removeAttribute('aria-required')

    const helpText = node.helpText ?? node.annotations.description
    description.textContent = helpText ?? ''
    description.hidden = !helpText

    const visibleErrors = state.showErrors ? state.errors : []
    errors.replaceChildren(
      ...visibleErrors.map((error) => {
        const line = document.createElement('div')
        line.textContent = error.message ?? error.keyword
        return line
      }),
    )
    errors.hidden = visibleErrors.length === 0

    const describedBy: string[] = []
    if (helpText) describedBy.push(description.id)
    if (visibleErrors.length > 0) describedBy.push(errors.id)
    if (describedBy.length > 0) control.setAttribute('aria-describedby', describedBy.join(' '))
    else control.removeAttribute('aria-describedby')
    if (visibleErrors.length > 0) control.setAttribute('aria-invalid', 'true')
    else control.removeAttribute('aria-invalid')
  }

  renderIds()
  render()

  return {
    element: root,
    update(next) {
      node = next as FieldNode
      renderIds()
      state.rebind(node)
      render()
    },
    destroy() {
      state.destroy()
    },
  }
}

export const textInput = (node: UINode, ctx: RenderContext): DomWidget => fieldWidget('string', node, ctx)
export const numberInput = (node: UINode, ctx: RenderContext): DomWidget => fieldWidget('number', node, ctx)
export const checkbox = (node: UINode, ctx: RenderContext): DomWidget => fieldWidget('boolean', node, ctx)
export const select = (node: UINode, ctx: RenderContext): DomWidget => fieldWidget('enum', node, ctx)
export const textarea = (node: UINode, ctx: RenderContext): DomWidget => fieldWidget('textarea', node, ctx)
