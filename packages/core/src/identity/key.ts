import type { StableItemId } from '../types.js'

/**
 * Addresses a logical array container independently of position. Opaque to
 * consumers: stable for the lifetime of that container, never to be parsed.
 */
export type IdentityKey = string & { __brand: 'IdentityKey' }

export type IdentitySegment =
  | { kind: 'property'; name: string }
  | { kind: 'item'; id: StableItemId }

export const ROOT_IDENTITY_KEY = '' as IdentityKey

export function identityKey(segments: readonly IdentitySegment[]): IdentityKey {
  return segments
    .map((segment) =>
      segment.kind === 'property' ? `p=${encodeURIComponent(segment.name)}` : `i=${segment.id}`,
    )
    .join('/') as IdentityKey
}
