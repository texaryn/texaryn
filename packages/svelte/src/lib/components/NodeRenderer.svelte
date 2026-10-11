<script lang="ts">
  import type { UINode } from '@texaryn/core'
  import { useFormContext } from '../context.js'
  import type { WidgetComponent } from '../widget.js'

  interface Props {
    node: UINode
  }

  let { node }: Props = $props()
  const context = useFormContext()
  const registry = context.registry
  const widget = $derived($registry.resolve(node) as WidgetComponent | undefined)
</script>

{#if node.visible && widget}
  {@const Widget = widget}
  <Widget {node} />
{/if}
