import type { RendererProps } from '../renderer-types.js'
import { WcHost } from '../WcHost.js'

export default function WebComponentsRenderer({ runtime }: Readonly<RendererProps>) {
  return <WcHost runtime={runtime} />
}
