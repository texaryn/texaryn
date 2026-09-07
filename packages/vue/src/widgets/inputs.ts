import { defineComponent, h } from 'vue'
import type { PropType, VNode } from 'vue'
import type { FieldNode, UINode } from '@texaryn/core'
import { useFieldWidget } from '../use-field-widget.js'
import type { FieldWidget } from '../use-field-widget.js'
import { FieldErrors } from './FieldErrors.js'

const nodeProp = { node: { type: Object as PropType<UINode>, required: true } } as const

/** The wording every binding uses, so a custom widget can match it. */
export const REQUIRED_INDICATOR = '(required)'

/**
 * Three separate channels carry one fact and must not be collapsed. The
 * sighted user reads "(required)"; the accessible name stays the label alone,
 * because aria-required already reports the state and naming it too makes some
 * screen readers say it twice; and the indicator says the word rather than an
 * asterisk, so nobody has to be told elsewhere what a marker means.
 */
function labelContent(field: FieldWidget): Array<VNode | string> {
  const content: Array<VNode | string> = [field.label.value]
  if (field.aria.value['aria-required']) {
    content.push(h('span', { 'aria-hidden': 'true' }, ` ${REQUIRED_INDICATOR}`))
  }
  return content
}

function fieldShell(field: FieldWidget, control: VNode): VNode {
  return h('div', [
    h(
      'label',
      { id: `${field.labelFor.value}-label`, for: field.labelFor.value },
      labelContent(field),
    ),
    control,
    field.description.value
      ? h('div', { id: field.descriptionId.value }, field.description.value)
      : null,
    h(FieldErrors, { id: field.errorId.value, errors: field.errors.value }),
  ])
}

/**
 * The node prop is read through a getter rather than destructured, so a
 * widget whose node is swapped underneath it (an array move keeps the
 * component instance and changes the node) follows the new one.
 */
function useNode(props: { node: UINode }): FieldWidget {
  return useFieldWidget(() => props.node as FieldNode)
}

export const TextInput = defineComponent({
  name: 'TextInput',
  props: nodeProp,
  setup(props) {
    const field = useNode(props)
    return () =>
      fieldShell(
        field,
        h('input', {
          ...field.aria.value,
          type: 'text',
          value: field.display.value,
          onInput: (event: Event) => field.setRaw((event.target as HTMLInputElement).value),
          onBlur: field.onBlur,
        }),
      )
  },
})

export const NumberInput = defineComponent({
  name: 'NumberInput',
  props: nodeProp,
  setup(props) {
    const field = useNode(props)
    return () =>
      fieldShell(
        field,
        h('input', {
          ...field.aria.value,
          type: 'number',
          value: field.display.value,
          onInput: (event: Event) => field.setRaw((event.target as HTMLInputElement).value),
          onBlur: field.onBlur,
        }),
      )
  },
})

export const Textarea = defineComponent({
  name: 'Textarea',
  props: nodeProp,
  setup(props) {
    const field = useNode(props)
    return () =>
      fieldShell(
        field,
        h('textarea', {
          ...field.aria.value,
          value: field.display.value,
          onInput: (event: Event) => field.setRaw((event.target as HTMLTextAreaElement).value),
          onBlur: field.onBlur,
        }),
      )
  },
})

export const Checkbox = defineComponent({
  name: 'Checkbox',
  props: nodeProp,
  setup(props) {
    const field = useNode(props)
    return () =>
      fieldShell(
        field,
        h('input', {
          ...field.aria.value,
          type: 'checkbox',
          checked: Boolean(field.value.value),
          onChange: (event: Event) => field.setValue((event.target as HTMLInputElement).checked),
          onBlur: field.onBlur,
        }),
      )
  },
})

export const Select = defineComponent({
  name: 'Select',
  props: nodeProp,
  setup(props) {
    const field = useNode(props)
    return () =>
      fieldShell(
        field,
        h(
          'select',
          {
            ...field.aria.value,
            value: field.display.value,
            onChange: (event: Event) => field.setRaw((event.target as HTMLSelectElement).value),
            onBlur: field.onBlur,
          },
          [
            h('option', { value: '' }, ''),
            ...(field.node.value.enumValues ?? []).map((option) =>
              h('option', { key: String(option.value), value: String(option.value) },
                option.title ?? String(option.value)),
            ),
          ],
        ),
      )
  },
})
