import type { RendererProps } from '../renderer-types.js'
import { VueHost } from '../VueHost.js'

export default function VueRenderer({ runtime }: RendererProps) {
  return <VueHost runtime={runtime} />
}
