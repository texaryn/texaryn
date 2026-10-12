import { describe, it, expect } from 'vitest'
import { manualChunks, sharedModules } from './chunking.js'

const EDITOR = '/repo/apps/playground/src/editor/SchemaEditor.tsx'
const PALETTE = '/repo/apps/playground/src/palette/Palette.tsx'
const ENTRY = '/repo/apps/playground/src/main.tsx'
const UTIL = '/repo/apps/playground/src/util/both.ts'
const LEAF = '/repo/apps/playground/src/util/leaf.ts'

function graph(edges: Record<string, string[]>) {
  const ids = new Set(Object.keys(edges))
  for (const deps of Object.values(edges)) for (const dep of deps) ids.add(dep)
  const importers = (id: string) => Object.keys(edges).filter((from) => edges[from].includes(id))
  return {
    getModuleIds: () => ids.values(),
    getModuleInfo: (id: string) => ({ importedIds: edges[id] ?? [], importers: importers(id), dynamicImporters: [] }),
  } as unknown as Parameters<typeof sharedModules>[0]
}

describe('sharedModules', () => {
  it('leaves a module only the editor imports to the editor chunk', () => {
    expect(sharedModules(graph({ [ENTRY]: [], [EDITOR]: [UTIL] }))).toEqual(new Set())
  })

  it('leaves a module only the palette imports to the palette chunk', () => {
    expect(sharedModules(graph({ [ENTRY]: [], [PALETTE]: [UTIL] }))).toEqual(new Set())
  })

  it('names a module imported by the editor and the palette shared', () => {
    expect(sharedModules(graph({ [ENTRY]: [], [EDITOR]: [UTIL], [PALETTE]: [UTIL] }))).toEqual(new Set([UTIL]))
  })

  it('names a module imported by the editor and the entry shared', () => {
    expect(sharedModules(graph({ [ENTRY]: [UTIL], [EDITOR]: [UTIL] }))).toEqual(new Set([UTIL]))
  })

  it('names the dependencies of a shared module shared too', () => {
    expect(sharedModules(graph({ [ENTRY]: [UTIL], [EDITOR]: [UTIL], [UTIL]: [LEAF] }))).toEqual(new Set([UTIL, LEAF]))
  })
})

describe('manualChunks', () => {
  it('assigns lazy group modules and shared modules, and leaves the rest', () => {
    const meta = graph({ [ENTRY]: [UTIL], [EDITOR]: [UTIL] }) as unknown as Parameters<typeof manualChunks>[1]
    expect(manualChunks(EDITOR, meta)).toBe('editor')
    expect(manualChunks(PALETTE, meta)).toBe('palette')
    expect(manualChunks(UTIL, meta)).toBe('shared')
    expect(manualChunks(ENTRY, meta)).toBeUndefined()
  })
})
