// Every published package, in one place.
//
// Three release scripts need this list and each used to carry its own copy:
// the tarball verification, the registry check that decides whether the
// publish job runs, and the GitHub release planner. Adding `@texaryn/vue`
// reached two of the three, so npm served 0.1.0 while the planner reported
// "planned releases: 0" and the release tag was never written. The publish
// succeeded and the evidence of it did not, which is the worst shape for this
// kind of drift: nothing failed.
//
// `expectedExport` is the symbol the packing verification imports from the
// built tarball, as proof the package works when installed rather than only
// when built.
export const publishedPackages = [
  { name: '@texaryn/core', dir: 'packages/core', expectedExport: 'createFormRuntime' },
  { name: '@texaryn/schema-json', dir: 'packages/schema-json', expectedExport: 'createJsonSchemaAdapter' },
  { name: '@texaryn/react', dir: 'packages/react', expectedExport: 'useForm' },
  { name: '@texaryn/react-bootstrap', dir: 'packages/react-bootstrap', expectedExport: 'createBootstrapRegistry' },
  { name: '@texaryn/react-mui', dir: 'packages/react-mui', expectedExport: 'createMuiRegistry' },
  { name: '@texaryn/vue', dir: 'packages/vue', expectedExport: 'provideFormRuntime' },
]
