// Two pieces of the platform the theme controller talks to are missing from
// jsdom as vitest configures it: `matchMedia` does not exist at all, and the
// `localStorage` getter returns undefined. They are supplied here rather than
// guarded against in the code under test, because a branch that only exists
// for the test environment is a branch nothing verifies in the real one.
//
// The media query is a stub a test drives, which is the point: `auto`
// following the system and an explicit choice ignoring it are only
// distinguishable if the system preference can be made to change.

class MemoryStorage implements Storage {
  #entries = new Map<string, string>()

  get length(): number {
    return this.#entries.size
  }

  key(index: number): string | null {
    return [...this.#entries.keys()][index] ?? null
  }

  getItem(key: string): string | null {
    return this.#entries.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.#entries.set(key, String(value))
  }

  removeItem(key: string): void {
    this.#entries.delete(key)
  }

  clear(): void {
    this.#entries.clear()
  }

  [name: string]: unknown
}

interface MediaQueryStub extends MediaQueryList {
  matches: boolean
}

const queries = new Map<string, MediaQueryStub>()

function queryFor(media: string): MediaQueryStub {
  const existing = queries.get(media)
  if (existing) return existing

  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const stub = {
    media,
    matches: false,
    onchange: null,
    addEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => {
      if (type === 'change') listeners.add(listener)
    },
    removeEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => {
      if (type === 'change') listeners.delete(listener)
    },
    addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeListener: (listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    dispatchEvent: () => true,
    notify() {
      for (const listener of [...listeners]) {
        listener({ matches: stub.matches, media } as MediaQueryListEvent)
      }
    },
  } as unknown as MediaQueryStub & { notify(): void }

  queries.set(media, stub)
  return stub
}

/** Sets a media query's current answer and tells everyone listening. */
export function setMediaQuery(media: string, matches: boolean): void {
  const stub = queryFor(media) as MediaQueryStub & { notify(): void }
  stub.matches = matches
  stub.notify()
}

/** Drops every stub, so one test's system preference cannot reach the next. */
export function resetMediaQueries(): void {
  queries.clear()
}

if (!window.localStorage) {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  })
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: window.localStorage,
  })
}

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (media: string) => queryFor(media),
})
