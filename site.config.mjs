// The deployed site's topology, in one place.
//
// It sits at the repository root rather than inside either application
// because it describes neither one on its own: the documentation site owns
// the root of the Pages artifact and the playground owns a directory inside
// it, and every reader below has to agree about where that boundary is.
//
//   Astro config           BASE, BASE_PATH, PLAYGROUND_PATH
//   404 redirect           PLAYGROUND_PATH, interpolated at build time
//   playground Vite build  PLAYGROUND_PATH, as the asset base for Pages
//   compose-site           PLAYGROUND_MOUNT, as the directory to write
//   check-site-links       BASE_PATH, PLAYGROUND_PATH
//
// Both broken links this repository has shipped came from one of these
// readers holding its own copy of the value and drifting from the rest. The
// playground's asset base is the case that would have stayed silent longest:
// the link checker reads anchors, so a playground built against a stale base
// would pass the check and then fail to boot.
//
// Prose links in authored content still write the path out. Those are caught
// rather than prevented: a base change makes every one of them fail the link
// check as a path outside the site.
export const BASE = '/texaryn'
export const BASE_PATH = `${BASE}/`

export const PLAYGROUND_MOUNT = 'playground'
export const PLAYGROUND_PATH = `${BASE_PATH}${PLAYGROUND_MOUNT}/`
