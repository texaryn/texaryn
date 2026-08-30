import type { UINode } from '../ir/types.js'

export interface WidgetTester {
  test(node: UINode): boolean
  rank: number
}

export interface WidgetEntry<T = unknown> {
  tester: WidgetTester
  component: T
}

export interface RendererRegistry<T = unknown> {
  register(tester: WidgetTester, component: T): void
  resolve(node: UINode): T | undefined
}
