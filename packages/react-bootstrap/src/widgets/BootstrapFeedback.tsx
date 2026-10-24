import type { FieldBinding } from '@texaryn/react'

// .invalid-feedback is display: none unless it follows an .is-invalid sibling or
// carries d-block. The lines sit inside the live region, not beside the
// control, so each one needs d-block.
export function BootstrapFeedback({ field }: Readonly<{ field: FieldBinding }>) {
  const occurrences = new Map<string, number>()
  return (
    <>
      {field.description ? (
        <div {...field.descriptionProps} className="form-text">{field.description}</div>
      ) : null}
      {/* Always rendered and empty while valid: a live region inserted with
          its content already in place is not reliably announced. */}
      <div {...field.errorProps}>
        {field.invalid
          ? field.errorMessages.map((message) => {
              const occurrence = occurrences.get(message) ?? 0
              occurrences.set(message, occurrence + 1)
              return <div key={`${message}:${occurrence}`} className="invalid-feedback d-block">{message}</div>
            })
          : null}
      </div>
    </>
  )
}
