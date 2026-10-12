import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormRuntime } from '@texaryn/core'
import type { ExamplePreset } from '@texaryn/examples'
import { useStore } from '@texaryn/react'

export function applyPreset(runtime: FormRuntime, data: unknown, invalid: boolean): void {
  runtime.dispatch({ type: 'Reset', data: data === undefined ? {} : data })
  if (invalid) runtime.dispatch({ type: 'Validate' })
}

export function usePresetSelection(
  runtime: FormRuntime,
  presets: readonly ExamplePreset[],
  initialData: unknown,
): { selected: string; select: (id: string) => void } {
  const data = useStore(runtime.data)
  const [selected, setSelected] = useState('initial')
  const applied = useRef<unknown>(runtime.data.getSnapshot())

  useEffect(() => {
    if (data !== applied.current) setSelected('custom')
  }, [data])

  const select = useCallback(
    (id: string) => {
      const preset = presets.find((candidate) => candidate.id === id)
      const data = preset ? preset.data : initialData
      applyPreset(runtime, data === undefined ? {} : data, preset?.invalid === true)
      applied.current = runtime.data.getSnapshot()
      setSelected(preset ? id : 'initial')
    },
    [runtime, presets, initialData],
  )

  return { selected, select }
}

export function DataPresetSelect({
  presets,
  selected,
  onSelect,
}: {
  presets: readonly ExamplePreset[]
  selected: string
  onSelect: (id: string) => void
}) {
  if (presets.length === 0) return null
  return (
    <label className="pg-preset">
      <span>Data</span>
      <select
        aria-label="Data preset"
        className="pg-select"
        value={selected}
        onChange={(event) => onSelect(event.target.value)}
      >
        <option value="initial">Initial</option>
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.invalid ? `${preset.label} (invalid)` : preset.label}
          </option>
        ))}
        {selected === 'custom' && <option value="custom">Custom</option>}
      </select>
    </label>
  )
}
