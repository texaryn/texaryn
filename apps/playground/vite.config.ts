import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { PLAYGROUND_PATH } from '../../site.config.mjs'

// Two mounts, because the application runs in two topologies. On its own it
// owns the site root and sits at /playground/; in the Pages artifact the
// documentation site owns the root and this moves under the site base.
//
// The Pages value comes from the shared topology rather than a --base literal
// in package.json. That literal was the last copy of the site base outside
// site.config.mjs, and the quietest: the composed link check reads anchors,
// so a playground built against a stale base would pass every check and then
// fail to load its own assets.
//
// Nothing here adds a dependency on generated output. Materializing an entry
// point per catalog example is a Pages-build concern and lives in
// scripts/materialize-routes.mjs, so loading this config never needs a build
// to have run.
//
// The workspace prerequisite still applies: the internal packages resolve
// through their compiled dist, so `pnpm build` has to run before the dev
// server can resolve them.
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? PLAYGROUND_PATH : '/playground/',
  plugins: [react()],
}))
