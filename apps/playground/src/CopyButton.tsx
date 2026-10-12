export function CopyButton({ onCopy }: { onCopy: () => void }) {
  return (
    <button type="button" className="pg-button pg-button--quiet" onClick={onCopy}>
      Copy
    </button>
  )
}
