import { useId, useMemo } from 'react'
import {
  addBuilderField,
  getFormBuilderModel,
  removeBuilderField,
  updateBuilderField,
} from './form-builder-model.js'
import type { BuilderFieldType } from './form-builder-model.js'

const fieldTypes: readonly { value: BuilderFieldType; label: string }[] = [
  { value: 'string', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'integer', label: 'Integer' },
  { value: 'boolean', label: 'Boolean' },
]

export function FormBuilder({
  schemaText,
  onSchemaChange,
}: {
  schemaText: string
  onSchemaChange: (schemaText: string) => void
}) {
  const id = useId()
  const model = useMemo(() => getFormBuilderModel(schemaText), [schemaText])

  if (!model.available) {
    return (
      <div className="pg-builder">
        <p className="pg-builder__message" role="status">{model.message}</p>
      </div>
    )
  }

  return (
    <div className="pg-builder" aria-label="Visual form builder">
      <p className="pg-builder__message">
        Edit root fields, labels, types and required state here. Use JSON Schema for constraints, enums, references and nested fields.
      </p>
      <button className="pg-button" type="button" onClick={() => onSchemaChange(addBuilderField(schemaText))}>
        Add field
      </button>

      {model.fields.length === 0 && model.advancedFields.length === 0 && (
        <p className="pg-empty">No fields yet. Add a field to start the form.</p>
      )}

      <div className="pg-builder__fields">
        {model.fields.map((field, index) => {
          const prefix = `${id}-${index}`
          const labelId = `${prefix}-label`
          const typeId = `${prefix}-type`
          const requiredId = `${prefix}-required`
          return (
            <fieldset className="pg-builder__field" key={field.name}>
              <legend>{field.name}</legend>
              <label className="pg-builder__control" htmlFor={labelId}>
                Label
                <input
                  id={labelId}
                  className="pg-builder__input"
                  value={field.title}
                  onChange={(event) => onSchemaChange(updateBuilderField(schemaText, field.name, { title: event.target.value }))}
                />
              </label>
              <label className="pg-builder__control" htmlFor={typeId}>
                Type
                <select
                  id={typeId}
                  className="pg-select"
                  value={field.type}
                  onChange={(event) => onSchemaChange(updateBuilderField(schemaText, field.name, { type: event.target.value as BuilderFieldType }))}
                >
                  {fieldTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
              <label className="pg-checkbox-label" htmlFor={requiredId}>
                <input
                  id={requiredId}
                  type="checkbox"
                  checked={field.required}
                  onChange={(event) => onSchemaChange(updateBuilderField(schemaText, field.name, { required: event.target.checked }))}
                />
                Required
              </label>
              <button
                className="pg-button pg-button--quiet"
                type="button"
                onClick={() => onSchemaChange(removeBuilderField(schemaText, field.name))}
              >
                Remove field
              </button>
            </fieldset>
          )
        })}
      </div>

      {model.advancedFields.length > 0 && (
        <details className="pg-builder__advanced">
          <summary>Advanced fields, edit in JSON ({model.advancedFields.length})</summary>
          <ul>
            {model.advancedFields.map((name) => <li key={name}><code>{name}</code></li>)}
          </ul>
        </details>
      )}
    </div>
  )
}
