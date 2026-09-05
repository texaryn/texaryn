import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The mount point, not the site root. Pages overrides this with
// --base=/texaryn/playground/ so the documentation site can own everything
// above it.
//
// Nothing here adds a further dependency on generated output. Materializing
// an entry point per catalog example is a Pages-build concern and lives in
// scripts/materialize-routes.mjs, so loading this config never needs a build
// to have run.
//
// The workspace prerequisite still applies: the internal packages resolve
// through their compiled dist, so `pnpm build` has to run before the dev
// server can resolve them.
export default defineConfig({
  base: '/playground/',
  plugins: [react()],
})
