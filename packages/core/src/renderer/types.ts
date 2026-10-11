import type { UINode } from '../ir/types.js'

export interface WidgetTester<Node = UINode> {
  test(node: Node): boolean
  rank: number
}

export interface WidgetEntry<T = unknown, Node = UINode> {
  tester: WidgetTester<Node>
  component: T
}

export interface RendererRegistry<T = unknown, Node = UINode> {
  register(tester: WidgetTester<Node>, component: T): void
  resolve(node: Node): T | undefined
}
