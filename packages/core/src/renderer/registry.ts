import type { UINode } from '../ir/types.js'
import type { WidgetTester, RendererRegistry } from './types.js'

export function createRendererRegistry<T>(): RendererRegistry<T> {
  const entries: Array<{ tester: WidgetTester; component: T }> = []

  return {
    register(tester, component) {
      entries.push({ tester, component })
    },
    resolve(node: UINode) {
      let best: { tester: WidgetTester; component: T } | undefined
      for (const entry of entries) {
        if (!entry.tester.test(node)) continue
        if (!best || entry.tester.rank > best.tester.rank) {
          best = entry
        }
      }
      return best?.component
    },
  }
}
