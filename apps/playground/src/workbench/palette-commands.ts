import type { ExamplePreset, TexarynExample } from '@texaryn/examples'
import type { RendererKey } from '../routing.js'
import type { ThemePreference } from '../theme.js'
import type { LayoutAction } from '../workbench/layout.js'

export type CommandGroup = 'Examples' | 'Renderers' | 'Data presets' | 'Layout' | 'Theme' | 'Schema' | 'Help'

export interface PaletteCommand {
  id: string
  group: CommandGroup
  label: string
  keywords?: readonly string[]
  run: () => void
}

export interface CommandActions {
  selectExample(example: TexarynExample): void
  selectRenderer(key: RendererKey): void
  applyPreset(preset: ExamplePreset | null): void
  layout(action: LayoutAction): void
  resetLayout(): void
  setTheme(preference: ThemePreference): void
  formatSchema(): void
  copySchema(): void
  copyData(): void
  openDocs(): void
}

export interface CommandInput {
  examples: readonly TexarynExample[]
  renderers: readonly { key: RendererKey; label: string }[]
  presets: readonly ExamplePreset[]
  canFormat: boolean
  desktop: boolean
  actions: CommandActions
}

export function buildCommands({ examples, renderers, presets, canFormat, desktop, actions }: CommandInput): PaletteCommand[] {
  const commands: PaletteCommand[] = []
  for (const example of examples) {
    commands.push({
      id: `example:${example.id}`,
      group: 'Examples',
      label: example.title,
      keywords: [example.id, example.category],
      run: () => actions.selectExample(example),
    })
  }
  for (const { key, label } of renderers) {
    commands.push({ id: `renderer:${key}`, group: 'Renderers', label: `Switch to ${label}`, run: () => actions.selectRenderer(key) })
  }
  if (presets.length > 0) {
    commands.push({ id: 'preset:initial', group: 'Data presets', label: 'Apply data preset: Initial', run: () => actions.applyPreset(null) })
    for (const preset of presets) {
      commands.push({
        id: `preset:${preset.id}`,
        group: 'Data presets',
        label: `Apply data preset: ${preset.label}`,
        run: () => actions.applyPreset(preset),
      })
    }
  }
  if (desktop) {
    const layout = (id: string, label: string, action: LayoutAction): PaletteCommand => ({
      id: `layout:${id}`,
      group: 'Layout',
      label,
      run: () => actions.layout(action),
    })
    commands.push(
      layout('focus', 'Toggle Focus mode', { type: 'toggleFocus' }),
      layout('max-schema', 'Maximize schema', { type: 'maximize', pane: 'schema' }),
      layout('max-preview', 'Maximize preview', { type: 'maximize', pane: 'preview' }),
      layout('max-inspector', 'Maximize inspector', { type: 'maximize', pane: 'inspector' }),
      layout('inspector', 'Collapse or expand the inspector', { type: 'toggleInspector' }),
      layout('examples', 'Collapse or expand the examples', { type: 'toggleExamples' }),
      { id: 'layout:reset', group: 'Layout', label: 'Reset layout', run: actions.resetLayout },
    )
  }
  for (const preference of ['light', 'dark', 'auto'] as const) {
    commands.push({ id: `theme:${preference}`, group: 'Theme', label: `Theme: ${preference}`, run: () => actions.setTheme(preference) })
  }
  if (canFormat) commands.push({ id: 'schema:format', group: 'Schema', label: 'Format schema', run: actions.formatSchema })
  commands.push(
    { id: 'schema:copy', group: 'Schema', label: 'Copy schema', run: actions.copySchema },
    { id: 'schema:copy-data', group: 'Schema', label: 'Copy data', run: actions.copyData },
    { id: 'help:docs', group: 'Help', label: 'Open the documentation', run: actions.openDocs },
  )
  return commands
}
