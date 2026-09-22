# Security policy

## Supported versions

Texaryn publishes seven packages to npm, and each one versions independently:

- `@texaryn/core`
- `@texaryn/schema-json`
- `@texaryn/react`
- `@texaryn/react-bootstrap`
- `@texaryn/react-mui`
- `@texaryn/vue`
- `@texaryn/web-components`

While a package is below 1.0, its public API may change between minor versions.

| Version | Receives security fixes |
| --- | --- |
| The release on the npm `latest` dist-tag of each package | Yes |
| Any earlier release | No |

A fix ships as a new release of each affected package on the `latest` dist-tag. Earlier minor versions do not receive backports, so upgrading to the latest release is the way to pick up a fix. `npm view @texaryn/core version` prints the current release of a package.

The five private workspace packages (`@texaryn/examples`, `@texaryn/schema-json-hyperjump`, `@texaryn/conformance-tests`, `@texaryn/playground` and `@texaryn/docs`) are not published to npm. The documentation site and playground at <https://texaryn.github.io/texaryn/> are built from this repository, and a vulnerability in them can be reported the same way.

## Reporting a vulnerability

Do not report a vulnerability through a public issue, discussion or pull request.

Report it privately through GitHub private vulnerability reporting:

1. Open the **Security and quality** tab of this repository.
2. Select **Report a vulnerability**.
3. Fill in the form and submit it.

The form is also reachable directly at <https://github.com/texaryn/texaryn/security/advisories/new>.

A useful report names the affected package and version, gives the smallest schema, UI hints or IR document that reproduces the problem, and describes the impact.

## What happens after a report

Submitting the form creates a vulnerability report: a proposed security advisory in the `Triage` state that only the reporter, the maintainers and collaborators they add can see. The maintainer acknowledges the report and asks any questions in comments on it.

A report the maintainer accepts becomes a draft security advisory, still private, and work on the fix continues there. A report that describes no security risk is closed with a comment that explains why.

When a fix is ready, it ships as a new release of each affected package. The advisory is then published with the affected and patched versions, a CVE when one applies, and credit to the reporter unless they ask to stay anonymous.

## Scope

The runtime executes no dynamic code: no `eval`, no `Function()` and no `innerHTML` assignment. A way to make the runtime or a renderer execute code or inject HTML from a schema, UI hints or an IR document is in scope.

Client-side validation is advisory. The runtime does not make submitted data safe, and a server must validate every submission again. A way to get data past client-side validation is not, on its own, a vulnerability.
