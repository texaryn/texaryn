import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormRuntime } from '@texaryn/core'
import type { ExamplePreset } from '@texaryn/examples'
import { useStore } from '@texaryn/react'

export function applyPreset(runtime: FormRuntime, data: unknown, invalid: boolean): void {
  runtime.dispatch({ type: 'Reset', data: data === undefined ? {} : data })
  if (invalid) runtime.dispatch({ type: 'Validate' })
}

function dataKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(dataKey).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${dataKey(entry)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

function selectedForData(
  data: unknown,
  initialData: unknown,
  presets: readonly ExamplePreset[],
): string {
  const dataValue = data === undefined ? {} : data
  const initialValue = initialData === undefined ? {} : initialData
  const key = dataKey(dataValue)
  if (key === dataKey(initialValue)) return 'initial'
  return presets.find((preset) => key === dataKey(preset.data === undefined ? {} : preset.data))?.id ?? 'custom'
}

export function usePresetSelection(
  runtime: FormRuntime,
  presets: readonly ExamplePreset[],
  initialData: unknown,
): { selected: string; select: (id: string) => void } {
  const data = useStore(runtime.data)
  const initialSelection = selectedForData(runtime.data.getSnapshot(), initialData, presets)
  const [selected, setSelected] = useState(initialSelection)
  const restoreInvalidState = useRef(
    presets.some((preset) => preset.id === initialSelection && preset.invalid === true),
  )
  const applied = useRef<unknown>(runtime.data.getSnapshot())

  useEffect(() => {
    if (!restoreInvalidState.current) return
    restoreInvalidState.current = false
    runtime.dispatch({ type: 'Validate' })
  }, [runtime])

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
}: Readonly<{
  presets: readonly ExamplePreset[]
  selected: string
  onSelect: (id: string) => void
}>) {
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
