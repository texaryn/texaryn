import type { RendererProps } from '../renderer-types.js'
import { WcHost } from '../WcHost.js'

export default function WebComponentsRenderer({ runtime }: RendererProps) {
  return <WcHost runtime={runtime} />
}
