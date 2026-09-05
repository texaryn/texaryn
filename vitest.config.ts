import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('.', import.meta.url))

const alias = {
  '@texaryn/core': resolve(root, 'packages/core/src/index.ts'),
  '@texaryn/schema-json': resolve(
    root,
    'packages/schema-json/src/index.ts',
  ),
  '@texaryn/schema-json-hyperjump': resolve(
    root,
    'packages/schema-json-hyperjump/src/index.ts',
  ),
  '@texaryn/react': resolve(root, 'packages/react/src/index.ts'),
  '@texaryn/react-bootstrap': resolve(root, 'packages/react-bootstrap/src/index.ts'),
  '@texaryn/react-mui': resolve(root, 'packages/react-mui/src/index.ts'),
  '@texaryn/vue': resolve(root, 'packages/vue/src/index.ts'),
  '@texaryn/examples': resolve(root, 'packages/examples/src/index.ts'),
}

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      include: [
        'packages/core/src/**',
        'packages/schema-json/src/**',
        'packages/schema-json-hyperjump/src/**',
        'packages/react/src/**',
        'packages/react-bootstrap/src/**',
        'packages/react-mui/src/**',
        'packages/vue/src/**',
      ],
      // Type-only modules compile to nothing executable and would report 0%.
      exclude: [
        '**/__tests__/**',
        '**/*.test.*',
        '**/index.ts',
        '**/types.ts',
        '**/widget.ts',
        'packages/core/src/schema/**',
        'packages/core/src/hints/**',
      ],
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'core',
          root: 'packages/core',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'schema-json',
          root: 'packages/schema-json',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'schema-json-hyperjump',
          root: 'packages/schema-json-hyperjump',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'react',
          root: 'packages/react',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'react-bootstrap',
          root: 'packages/react-bootstrap',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'react-mui',
          root: 'packages/react-mui',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'vue',
          root: 'packages/vue',
          include: ['src/**/*.test.ts'],
          environment: 'jsdom',
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'examples',
          root: 'packages/examples',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'conformance',
          root: 'tests',
          include: ['conformance/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'example-conformance',
          root: 'tests',
          include: ['example-conformance/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'playground',
          root: 'apps/playground',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
        },
      },
      {
        test: {
          name: 'scripts',
          root: 'scripts',
          include: ['**/*.test.mjs'],
        },
      },
    ],
  },
})
