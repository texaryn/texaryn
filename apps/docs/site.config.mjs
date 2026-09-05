// Where the site lives, in one place.
//
// The Astro config needs it, the 404 redirect script needs it interpolated at
// build time, and the composed artifact's link checker needs it to tell a
// site route from a path nothing can serve. Three readers, one value: the
// broken links this repository has shipped both came from a second copy of
// the base drifting from the first.
export const BASE = '/texaryn'
export const BASE_PATH = `${BASE}/`
