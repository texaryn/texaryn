import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { RendererRegistry } from '@texaryn/core'
import { FormContext, FormRoot } from '@texaryn/react'
import type { WidgetComponent } from '@texaryn/react'
import type { DomAccessibilityAdapter } from '../renderer-dom-accessibility-contract.js'

/**
 * Mounts React over a runtime the contract owns. `useForm` is deliberately not
 * used: it would build a second runtime, and what is under test is how this
 * binding renders the one it is handed. Written with `createElement` rather
 * than JSX so the file needs no JSX configuration of its own.
 */
export function reactAdapter(
  name: string,
  createRegistry: () => RendererRegistry<WidgetComponent>,
): DomAccessibilityAdapter {
  const registry = createRegistry()
  return {
    name,
    async mount({ runtime, host }) {
      const root = createRoot(host)
      await act(async () => {
        root.render(
          createElement(
            FormContext.Provider,
            { value: runtime },
            createElement(FormRoot, { registry }),
          ),
        )
      })
      return {
        root: host,
        async act(run) {
          await act(async () => {
            run()
          })
        },
        async unmount() {
          await act(async () => {
            root.unmount()
          })
        },
      }
    },
  }
}
