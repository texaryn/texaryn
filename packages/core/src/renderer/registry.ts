import type { UINode } from '../ir/types.js'
import type { WidgetTester, RendererRegistry } from './types.js'

export function createRendererRegistry<T, Node = UINode>(): RendererRegistry<T, Node> {
  const entries: Array<{ tester: WidgetTester<Node>; component: T }> = []

  return {
    register(tester, component) {
      entries.push({ tester, component })
    },
    resolve(node: Node) {
      let best: { tester: WidgetTester<Node>; component: T } | undefined
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
