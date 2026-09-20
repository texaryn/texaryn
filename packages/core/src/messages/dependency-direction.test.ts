import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = fileURLToPath(new URL('..', import.meta.url))

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? filesUnder(path) : path.endsWith('.ts') ? [path] : []
  })
}

// ADR-004 rule 7: the runtime, its commands, its state and its schema port must
// not know copy exists, so the barrel that re-exports it counts as an import too.
describe('the messages module', () => {
  it.each(['runtime', 'commands', 'state', 'schema'])('is not imported from %s', (dir) => {
    const offenders = filesUnder(join(src, dir))
      .filter((file) => !file.includes('__tests__') && !file.includes('.test.'))
      .filter((file) =>
        /from\s+['"](?:[^'"]*messages\/[^'"]*|\.\.\/index\.js)['"]/.test(readFileSync(file, 'utf8')),
      )
    expect(offenders).toEqual([])
  })
})
