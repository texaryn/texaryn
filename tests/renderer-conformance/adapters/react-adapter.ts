import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { FormMessages, FormRuntime, RendererRegistry } from '@texaryn/core'
import { ErrorSummary, FormProvider, FormRoot } from '@texaryn/react'
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
    async mount({ runtime, host, messages, summary }) {
      const root = createRoot(host)
      const focus = typeof summary === 'object' ? summary.focus : true
      const render = async (current: FormMessages | undefined, rt: FormRuntime) => {
        await act(async () => {
          root.render(
            createElement(
              FormProvider,
              { value: rt, messages: current },
              summary ? createElement(ErrorSummary, { focus }) : null,
              createElement(FormRoot, { registry }),
            ),
          )
        })
      }
      await render(messages, runtime)
      return {
        root: host,
        async act(run) {
          await act(async () => {
            run()
            await new Promise((resolve) => setTimeout(resolve, 0))
          })
        },
        async setMessages(next) {
          await render(next, runtime)
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
