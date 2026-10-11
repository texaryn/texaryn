import { For, Show, createMemo } from 'solid-js'
import { objectChildKey } from '@texaryn/core'
import type { ContainerNode, ProjectionBoundaryTarget, UINode } from '@texaryn/core'
import { NodeRenderer } from '../components/NodeRenderer.js'
import { useFormContext } from '../context.js'

export function ObjectLayout(props: { node: UINode }) {
  const context = useFormContext()
  const container = createMemo(() => (context.document().nodes[props.node.id] ?? props.node) as ContainerNode)
  const children = createMemo(() => container().children
    .map((id) => context.document().nodes[id])
    .filter((child): child is UINode => child != null))
  const childKeys = createMemo(() => children().map(objectChildKey))
  const title = createMemo(() => container().annotations.title)
  const actions = createMemo(() => {
    const byReason = new Map<string, NonNullable<ContainerNode['boundaryTargets']>[number]>()
    for (const target of container().boundaryTargets ?? []) {
      if (!byReason.has(target.reason)) byReason.set(target.reason, target)
    }
    return [...byReason.values()]
  })
  const expandMessage = (target: ProjectionBoundaryTarget) => {
    const makeMessage = context.messages().expandBoundary ?? ((args) => ({
      label: `Show ${args.boundary}`,
      accessibleName: `Show ${args.boundary}`,
    }))
    return makeMessage({ boundary: target.reason, containerTitle: title(), position: 1, count: 1 })
  }
  const expand = (target: NonNullable<ContainerNode['boundaryTargets']>[number]) => {
    context.form().dispatch({ type: 'ExpandBoundary', containerId: container().id, targetToken: target.token })
  }
  const content = () => <div>
    <For each={childKeys()}>{(key) => {
      const child = createMemo(() => children().find((candidate) => objectChildKey(candidate) === key))
      return <Show when={child()}>{(value) => <NodeRenderer node={value()} />}</Show>
    }}</For>
    <For each={actions()}>{(target) => {
      const message = expandMessage(target)
      return <button type="button" aria-label={message.accessibleName} onClick={() => expand(target)}>{message.label}</button>
    }}</For>
  </div>

  return props.node.parentId === null
    ? content()
    : <fieldset role={title() === undefined ? 'none' : undefined}>
        <Show when={title()}>{(value) => <legend>{value()}</legend>}</Show>
        {content()}
      </fieldset>
}
