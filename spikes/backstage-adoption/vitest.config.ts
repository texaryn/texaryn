import { defineConfig } from 'vitest/config'

// No `resolve.alias` for `@texaryn/*`, deliberately. The monorepo's root
// config aliases every one of them to `packages/*/src`, which is the right
// thing there and would destroy this exercise: the point is to run against
// what an adopter can install. `src/admissibility.test.ts` fails if that ever
// stops being true.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
