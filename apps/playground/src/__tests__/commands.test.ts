import { describe, it, expect, vi } from 'vitest'
import { examples } from '@texaryn/examples'
import { buildCommands } from '../workbench/palette-commands.js'
import type { CommandActions } from '../workbench/palette-commands.js'

function actions(): CommandActions {
  return {
    selectExample: vi.fn(),
    selectRenderer: vi.fn(),
    applyPreset: vi.fn(),
    layout: vi.fn(),
    resetLayout: vi.fn(),
    setTheme: vi.fn(),
    formatSchema: vi.fn(),
    copySchema: vi.fn(),
    copyData: vi.fn(),
    openDocs: vi.fn(),
  }
}

const renderers = [
  { key: 'default', label: 'React · Default' },
  { key: 'bootstrap', label: 'React · Bootstrap 5' },
] as const

describe('buildCommands', () => {
  it('offers every example and every renderer', () => {
    const commands = buildCommands({ examples, renderers, presets: [], canFormat: true, canCopyData: true, desktop: true, actions: actions() })
    expect(commands.filter((command) => command.group === 'Examples')).toHaveLength(examples.length)
    expect(commands.filter((command) => command.group === 'Renderers')).toHaveLength(renderers.length)
  })

  it('runs the matching action', () => {
    const spy = actions()
    const commands = buildCommands({ examples, renderers, presets: [], canFormat: true, canCopyData: true, desktop: true, actions: spy })
    commands.find((command) => command.label === 'Switch to React · Bootstrap 5')!.run()
    expect(spy.selectRenderer).toHaveBeenCalledWith('bootstrap')
    commands.find((command) => command.label === 'Maximize preview')!.run()
    expect(spy.layout).toHaveBeenCalledWith({ type: 'maximize', pane: 'preview' })
  })

  it('offers presets, Format and layout commands only where they can run', () => {
    const presets = [{ id: 'valid', label: 'Valid', data: {} }]
    const phone = buildCommands({ examples, renderers, presets, canFormat: false, canCopyData: false, desktop: false, actions: actions() })
    expect(phone.some((command) => command.label === 'Apply data preset: Valid')).toBe(true)
    expect(phone.some((command) => command.label === 'Format schema')).toBe(false)
    expect(phone.some((command) => command.group === 'Layout')).toBe(false)
    expect(phone.some((command) => command.label === 'Copy data')).toBe(false)
  })

  it('offers Copy data only when the workspace is ready', () => {
    const ready = buildCommands({ examples, renderers, presets: [], canFormat: true, canCopyData: true, desktop: true, actions: actions() })
    const loading = buildCommands({ examples, renderers, presets: [], canFormat: true, canCopyData: false, desktop: true, actions: actions() })
    expect(ready.some((command) => command.label === 'Copy data')).toBe(true)
    expect(loading.some((command) => command.label === 'Copy data')).toBe(false)
  })
})
