import { createMemo, Show } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import type { UINode } from '@texaryn/core'
import { useFormContext } from '../context.js'

export function NodeRenderer(props: { node: UINode }) {
  const context = useFormContext()
  const node = createMemo(() => context.document().nodes[props.node.id] ?? props.node)
  const component = createMemo(() => context.registry().resolve(node()))
  return (
    <Show when={node().visible && component()}>
      <Dynamic component={component()!} node={node()} />
    </Show>
  )
}
