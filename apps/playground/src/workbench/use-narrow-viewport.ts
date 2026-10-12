import { useEffect, useState } from 'react'

// The same query as the phone CSS, so the tree and the stylesheet agree. The
// desktop minimums need 768px, so desktop starts at 820px, with room to spare.
export const NARROW_QUERY = '(max-width: 819px)'

export function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches)
  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY)
    const onChange = (event: MediaQueryListEvent) => setNarrow(event.matches)
    setNarrow(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return narrow
}
