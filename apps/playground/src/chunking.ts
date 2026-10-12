import type { Rollup } from 'vite'

export type LazyGroup = 'editor' | 'palette'

export function lazyGroup(id: string): LazyGroup | undefined {
  const file = id.replaceAll('\\', '/')
  if (/\/node_modules\/(@codemirror|@lezer|crelt|style-mod|w3c-keyname)\//.test(file) || file.includes('/apps/playground/src/editor/')) {
    return 'editor'
  }
  if (/\/node_modules\/(cmdk|@radix-ui)\//.test(file) || file.includes('/apps/playground/src/palette/')) {
    return 'palette'
  }
  return undefined
}

// Rollup pulls a manual chunk's static dependencies into it, so a module reached from two groups or from outside its group goes to 'shared'.
export function sharedModules({ getModuleIds, getModuleInfo }: Pick<Rollup.ManualChunkMeta, 'getModuleIds' | 'getModuleInfo'>): Set<string> {
  const reachedFrom = new Map<string, Set<LazyGroup>>()
  const visit = (id: string, group: LazyGroup) => {
    for (const dep of getModuleInfo(id)?.importedIds ?? []) {
      if (lazyGroup(dep)) continue
      const groups = reachedFrom.get(dep) ?? new Set<LazyGroup>()
      if (groups.has(group)) continue
      reachedFrom.set(dep, groups.add(group))
      visit(dep, group)
    }
  }
  for (const id of getModuleIds()) {
    const group = lazyGroup(id)
    if (group) visit(id, group)
  }

  const owner = new Map<string, LazyGroup>()
  for (const [id, groups] of reachedFrom) if (groups.size === 1) owner.set(id, [...groups][0])
  for (let changed = true; changed;) {
    changed = false
    for (const [id, group] of owner) {
      const info = getModuleInfo(id)
      const importers = [...(info?.importers ?? []), ...(info?.dynamicImporters ?? [])]
      if (importers.every((importer) => (lazyGroup(importer) ?? owner.get(importer)) === group)) continue
      owner.delete(id)
      changed = true
    }
  }
  return new Set([...reachedFrom.keys()].filter((id) => !owner.has(id)))
}

// One build per process: the cache is keyed on the first getModuleInfo it sees.
let shared: { key: Rollup.ManualChunkMeta['getModuleInfo']; ids: Set<string> } | undefined

export function manualChunks(id: string, meta: Rollup.ManualChunkMeta): string | undefined {
  const group = lazyGroup(id)
  if (group) return group
  if (shared?.key !== meta.getModuleInfo) shared = { key: meta.getModuleInfo, ids: sharedModules(meta) }
  return shared.ids.has(id) ? 'shared' : undefined
}
