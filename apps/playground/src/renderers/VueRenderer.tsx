import type { RendererProps } from '../renderer-types.js'
import { VueHost } from '../VueHost.js'

export default function VueRenderer({ runtime }: Readonly<RendererProps>) {
  return <VueHost runtime={runtime} />
}
