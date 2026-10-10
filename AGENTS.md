# Repository instructions

## Package releases

Published packages are versioned independently. The Changesets release workflow creates a tag for each published package in the form `@texaryn/package@version`. The GitHub release title matches that tag. Treat published tags as immutable.

Do not create a repository-wide `vMAJOR.MINOR.PATCH` tag for package releases. Independent packages can have the same version number. When changing this convention, update the release workflow, release planner, related tests, and this file.
