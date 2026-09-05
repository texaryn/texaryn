import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const repo = fileURLToPath(new URL('../../..', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@texaryn/core': resolve(repo, 'packages/core/src/index.ts'),
      '@texaryn/schema-json': resolve(repo, 'packages/schema-json/src/index.ts'),
    },
  },
  test: {
    name: 'spike-web-components',
    root: resolve(repo, 'tests'),
    include: ['spikes/web-components/src/**/*.test.ts'],
    environment: 'jsdom',
  },
})
