import { render } from '@testing-library/svelte'
import { createForm, FormRoot } from '../src/lib/index.js'
import { createDefaultRegistry } from '../src/lib/registry.js'
import type { TexarynExample } from '@texaryn/examples'
import type { RendererRegistry } from '@texaryn/core'
import type { WidgetComponent } from '../src/lib/widget.js'
import { adapterFor } from '../../../tests/example-conformance/matrix-shared.js'
import { svelteExampleRendererMatrix } from '../../../tests/example-conformance/svelte-renderer-matrix.js'

svelteExampleRendererMatrix({
  name: 'svelte',
  createRegistry: createDefaultRegistry,
  async renderExample(example: TexarynExample, registry: RendererRegistry<WidgetComponent>) {
    const port = await adapterFor(example)
    const form = createForm(port, {
      initialData: example.initialData,
      hints: example.hints,
    })
    const rendered = render(FormRoot, { props: { form, registry } })
    return {
      firstChild: rendered.container.firstChild,
      unmount: rendered.unmount,
    }
  },
})
