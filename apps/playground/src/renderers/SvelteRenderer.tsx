import type { RendererProps } from '../renderer-types.js'
import { SvelteHost } from '../SvelteHost.js'

export default function SvelteRenderer({ runtime }: RendererProps) {
  return <SvelteHost runtime={runtime} />
}
