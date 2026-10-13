# Releasing Texaryn

Texaryn releases twelve public npm packages independently. The first stable
release covers `@texaryn/core`, `@texaryn/schema-json`, and `@texaryn/react`,
each at version 1.0.0. Their package root exports are the supported public API.
The other nine packages stay below 1.0 until a separate compatibility review
approves their stable contracts. ADR-023 records this decision.

There is no repository version or repository-wide `v1.0.0` tag. The release
workflow creates an immutable `@texaryn/package@version` Git tag and matching
GitHub release for each package it publishes. Each npm package uses its own
`latest` dist-tag.

## Before the stable release

The release preparation pull request must include a Changesets entry for the
three stable packages and pass the following checks:

1. CI passes build, typecheck, coverage, generated API documentation, package
   tarball verification, stable consumer verification, and site build checks.
2. `pnpm changeset status` proposes 1.0.0 for the three stable packages.
   Review the packed ranges for each dependent package. When accepting a stable
   1.x dependency drops its prior pre-1.0 range, that package receives its next
   pre-stable minor version. Use a patch only when the packed range still
   accepts the previously supported dependency line. Dependent packages do not
   become 1.0 packages automatically.
   React Bootstrap and React MUI must declare the same React peer range as the
   stable React binding.
3. The stable consumer check installs the packed core, JSON Schema adapter, and
   React binding in a fresh npm project, without workspace aliases. It checks
   React 18.3 and React 19, typechecks and server-renders the documented React
   form, and confirms that npm resolved one core version.
4. The JSON Schema adapter suite passes against the maintained
   `@texaryn/json-schema-library` fork. The scheduled latest check resolves
   that scoped package, rather than the unrelated upstream package name.
5. The release notes describe the package API boundary, supported React
   versions, and compatibility policy.

Every public package must already exist on npm before its first trusted
publisher release. The packages in the stable cohort already exist. Trusted
publishing for `ci-release.yml` is configured through the protected
`npm-release` environment.

## Version packages

After the preparation pull request merges to `main`, the Changesets workflow
opens or updates a `Version Packages` pull request on
`changeset-release/main`. Review the generated versions, internal dependency
ranges, and changelogs. The stable cohort must be exactly 1.0.0. A dependent
0.x package that stops accepting its former internal 0.x dependency line
receives its own minor version, keeping existing consumers on the earlier
dependent minor line.

Merge the version pull request only after its full CI run passes. Changesets
keeps versions independent because `.changeset/config.json` has no fixed
package group.

## Publish

The push to `main` runs the release workflow. It checks the registry for every
package version, then publishes any missing version with npm provenance through
the protected `npm-release` environment. A required deployment reviewer must
approve the environment when GitHub requests it. Do not bypass that protection.

The workflow pins npm to 11.19.1 for trusted publishing, pushes one immutable
package tag for each published version, and reconciles the matching GitHub
releases. A partial publish can be rerun after npm reports the published
versions. The workflow skips versions already present and creates releases
that are missing.

## Verify the stable release

After the workflow completes, verify all three packages and any dependent
pre-stable minor releases:

```sh
npm view @texaryn/core version dist-tags
npm view @texaryn/schema-json version dist-tags
npm view @texaryn/react version dist-tags
npm view @texaryn/core@1.0.0 dist.tarball dist.integrity
```

Each stable package must report 1.0.0 on `latest`. Confirm the matching
`@texaryn/package@1.0.0` Git tag and GitHub release, npm provenance, and source
commit. Check package dependency ranges with a fresh consumer install. Do not
move a published tag or replace package contents. Publish a new version for
any correction.

## Later releases

For every change to a public package, add a changeset that names only the
packages whose public contract or usable dependency range changes. After 1.0,
backward-compatible fixes increment PATCH, backward-compatible features
increment MINOR, and incompatible public API changes increment MAJOR. Packages
that remain below 1.0 keep their own independent version policy. Security fixes
go to the current npm `latest` version of each affected package; earlier
versions do not receive backports.

If a release job waits at the `npm-release` environment, review the deployment
in the Actions run. A waiting job holds the release workflow concurrency slot.
Approve or reject it so later pushes are not left pending.

If publishing fails partway, wait until npm lists every published version,
then rerun the failed job with `gh run rerun <run-id> --failed`. The release
workflow skips versions that already exist and reconciles tags and GitHub
releases for the versions that were published.
