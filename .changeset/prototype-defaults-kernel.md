---
---

Adds the ADR-003 initialization pass to `packages/core` as a prototype over a
synthetic view. Nothing is exported and the build tsconfig excludes the
directory, so no published behaviour changes and there is no version to bump.
Deliberately empty rather than a patch: publishing anything here would ship the
part issue #120 leaves undecided.
