import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const repo = fileURLToPath(new URL('../../../..', import.meta.url))
const probe = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: probe,
  resolve: {
    alias: {
      '@texaryn/core': resolve(repo, 'packages/core/src/index.ts'),
      '@texaryn/schema-json': resolve(repo, 'packages/schema-json/src/index.ts'),
    },
  },
  server: {
    port: 5177,
    strictPort: true,
    fs: { allow: [repo] },
  },
})
