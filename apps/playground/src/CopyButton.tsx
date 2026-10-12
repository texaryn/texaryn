import { useEffect, useRef, useState } from 'react'

const STATUS_MS = 2000

export function CopyButton({ text }: { text: string }) {
  const [status, setStatus] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    const copied = await Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .then(() => true, () => false)
    clearTimeout(timer.current)
    setStatus(copied ? 'Copied' : 'Copy failed')
    timer.current = setTimeout(() => setStatus(''), STATUS_MS)
  }

  return (
    <span className="pg-copy">
      <button type="button" className="pg-button pg-button--quiet" onClick={() => void copy()}>
        Copy
      </button>
      <span role="status" className="pg-copy__status">{status}</span>
    </span>
  )
}
