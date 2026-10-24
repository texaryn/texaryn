import type { PreviewWidth } from './layout.js'

export const PREVIEW_WIDTHS: readonly { id: PreviewWidth; label: string; px: number | null }[] = [
  { id: 'phone', label: 'Phone', px: 375 },
  { id: 'tablet', label: 'Tablet', px: 768 },
  { id: 'fit', label: 'Fit', px: null },
]

export function WidthPresets({
  width,
  effectiveWidth,
  onChange,
}: Readonly<{
  width: PreviewWidth
  effectiveWidth: number
  onChange: (width: PreviewWidth) => void
}>) {
  const px = PREVIEW_WIDTHS.find((entry) => entry.id === width)?.px ?? null
  return (
    <div className="pg-width-presets" role="group" aria-label="Preview width">
      {PREVIEW_WIDTHS.map(({ id, label }) => (
        <button key={id} type="button" aria-pressed={width === id} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
      {px !== null && <span className="pg-width-presets__label">Maximum {px}px</span>}
      <span className="pg-width-presets__effective">Effective {effectiveWidth}px</span>
    </div>
  )
}
