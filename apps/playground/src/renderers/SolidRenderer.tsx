import type { RendererProps } from '../renderer-types.js'
import { SolidHost } from '../SolidHost.js'

export default function SolidRenderer({ runtime }: RendererProps) {
  return <SolidHost runtime={runtime} />
}
