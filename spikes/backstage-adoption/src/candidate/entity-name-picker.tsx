import { createElement } from 'react'
import { TextField } from '@mui/material'
import {
  type FieldNode,
  type RendererRegistry,
  type SchemaEvaluationPort,
  type UINode,
  type ValidationError,
  type ValidationResult,
} from '@texaryn/core'
import { getInputProps, useField, useFormIdPrefix, type WidgetComponent } from '@texaryn/react'
import { createMuiRegistry } from '@texaryn/react-mui'

/**
 * Backstage's entity-name rule, from `packages/catalog-model`: a name is 1 to
 * 63 characters of alphanumerics, `-`, `_` and `.`, starting and ending
 * alphanumeric.
 */
const entityName = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,61}[a-zA-Z0-9]$|^[a-zA-Z0-9]$/

export const entityNameMessage = 'must be a valid entity name'

/**
 * A stand-in for Backstage's `EntityNamePicker` field extension: a text input
 * that applies its own validation rule, which is what makes a field extension
 * more than a widget.
 *
 * Registered through `RendererRegistry.register`, which is public API and
 * needs no adapter. It selects on `node.widget`, which is where the hint
 * adapter puts `ui:field`, because a tester has no other channel to read.
 */
export const EntityNamePicker: WidgetComponent = ({ node }) => {
  const field = useField(node.id)
  const prefix = useFormIdPrefix()
  // The registry hands a widget a `UINode`, and `getInputProps` takes a
  // `FieldNode`. The tester above already established which this is, but the
  // prop type cannot carry that, so a widget narrows it itself.
  const input = getInputProps(node as FieldNode, field, prefix)
  const showError = field.showErrors && field.errors.length > 0

  return createElement(TextField, {
    id: input.id,
    name: input.name,
    label: node.annotations?.title,
    value: (field.value as string | undefined) ?? '',
    disabled: input.disabled,
    onChange: (event: { target: { value: string } }) => field.onChange(event.target.value),
    onBlur: field.onBlur,
    error: showError,
    helperText: showError ? field.errors[0]?.message : undefined,
  })
}

const isEntityNamePicker = (node: UINode): boolean =>
  node.type === 'field' && node.widget === 'EntityNamePicker'

/** The stock MUI registry with the field extension added on top of it. */
export function createRegistryWithEntityNamePicker(): RendererRegistry<WidgetComponent> {
  const registry = createMuiRegistry()
  // Above the type-based entries, which are rank 1 and 2.
  registry.register({ test: isEntityNamePicker, rank: 10 }, EntityNamePicker)
  return registry
}

/**
 * The part that needed an adapter.
 *
 * A field extension owns its own validation, and there is no way for a
 * registered widget to contribute a violation: `Command` has seven variants
 * and none of them reports an error, `SchemaEvaluationPort` is the only source
 * of a `ValidationResult`, and a widget is handed neither. So the rule has to
 * be applied by wrapping the port and appending to what it returns.
 *
 * That works, and it costs the property that made the extension local. The
 * rule now lives beside the schema rather than beside the component, so a
 * template that adds another `ui:field` needs this wrapper edited too, and a
 * wrapper that forgets a field fails silently. Recorded in the friction log
 * as an adapter.
 */
export function withEntityNameValidation(
  port: SchemaEvaluationPort,
  pointers: readonly string[],
): SchemaEvaluationPort {
  const extra = (data: unknown): ValidationError[] => {
    const errors: ValidationError[] = []
    for (const pointer of pointers) {
      const key = pointer.slice(1)
      const value = (data as Record<string, unknown> | undefined)?.[key]
      if (typeof value !== 'string' || value === '') continue
      if (!entityName.test(value)) {
        errors.push({
          instancePointer: pointer,
          keyword: 'entityName',
          message: entityNameMessage,
          params: { pattern: entityName.source },
        })
      }
    }
    return errors
  }

  return {
    project: (data) => port.project(data),
    validate: async (data): Promise<ValidationResult> => {
      const result = await port.validate(data)
      const errors = [...result.errors, ...extra(data)]
      return { valid: errors.length === 0, errors }
    },
  }
}
