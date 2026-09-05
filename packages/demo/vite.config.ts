import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves static files, so /playground/basics-string is a 404:
// no such file is built. Pages falls back to 404.html for any unmatched path,
// and serving the app from there lets it read the path and route itself.
//
// Without this, deep links work while navigating inside the app and break on
// refresh or when opened in a fresh tab, which is the worst version of broken
// because it survives casual testing.
function pagesSpaFallback() {
  let outDir = 'dist'
  let root = process.cwd()
  return {
    name: 'pages-spa-fallback',
    configResolved(config: { build: { outDir: string }; root: string }) {
      outDir = config.build.outDir
      root = config.root
    },
    closeBundle() {
      const dist = resolve(root, outDir)
      copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'))
    },
  }
}

export default defineConfig({
  plugins: [react(), pagesSpaFallback()],
})
