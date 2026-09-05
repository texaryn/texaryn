import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The mount point, not the site root. Pages overrides this with
// --base=/texaryn/playground/ so the documentation site can own everything
// above it.
//
// Nothing here depends on generated output, so `pnpm dev` works from a fresh
// clone. Materializing an entry point per catalog example is a Pages-build
// concern and lives in scripts/materialize-routes.mjs.
export default defineConfig({
  base: '/playground/',
  plugins: [react()],
})
