import { Command } from 'cmdk'
import type { CommandGroup, PaletteCommand } from '../workbench/palette-commands.js'

const ORDER: readonly CommandGroup[] = ['Examples', 'Renderers', 'Data presets', 'Layout', 'Theme', 'Schema', 'Help']

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  commands: readonly PaletteCommand[]
}

export default function CommandPalette({ open, onOpenChange, commands }: CommandPaletteProps) {
  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      contentClassName="pg-palette"
      overlayClassName="pg-palette__overlay"
    >
      <Command.Input className="pg-palette__input" placeholder="Search examples, renderers and actions" />
      <Command.List className="pg-palette__list">
        <Command.Empty>No command matches.</Command.Empty>
        {ORDER.map((group) => {
          const entries = commands.filter((command) => command.group === group)
          if (entries.length === 0) return null
          return (
            <Command.Group key={group} heading={group}>
              {entries.map((command) => (
                <Command.Item
                  key={command.id}
                  value={command.label}
                  keywords={command.keywords ? [...command.keywords] : undefined}
                  onSelect={() => {
                    onOpenChange(false)
                    command.run()
                  }}
                >
                  {command.label}
                </Command.Item>
              ))}
            </Command.Group>
          )
        })}
      </Command.List>
    </Command.Dialog>
  )
}
