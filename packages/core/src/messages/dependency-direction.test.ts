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

// ADR-004 rule 7. Copy is presentation vocabulary; the runtime, its commands,
// its state and its schema port must not know it exists.
describe('the messages module', () => {
  it.each(['runtime', 'commands', 'state', 'schema'])('is not imported from %s', (dir) => {
    const offenders = filesUnder(join(src, dir)).filter((file) =>
      /from\s+['"][^'"]*messages\//.test(readFileSync(file, 'utf8')),
    )
    expect(offenders).toEqual([])
  })
})
