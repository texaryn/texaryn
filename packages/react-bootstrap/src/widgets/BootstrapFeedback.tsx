import type { FieldBinding } from '@texaryn/react'

// .invalid-feedback is display: none unless it follows an .is-invalid sibling or
// carries d-block. The lines sit inside the role="alert" container, not beside
// the control, so each one needs d-block.
export function BootstrapFeedback({ field }: { field: FieldBinding }) {
  return (
    <>
      {field.description ? (
        <div {...field.descriptionProps} className="form-text">{field.description}</div>
      ) : null}
      {field.invalid ? (
        <div {...field.errorProps}>
          {field.errors.map((error, index) => (
            <div key={index} className="invalid-feedback d-block">{error.message ?? error.keyword}</div>
          ))}
        </div>
      ) : null}
    </>
  )
}
