# Security policy

## Supported versions

Texaryn publishes twelve packages to npm, and each package versions
independently:

- `@texaryn/core`
- `@texaryn/schema-json`
- `@texaryn/react`
- `@texaryn/react-bootstrap`
- `@texaryn/react-mui`
- `@texaryn/vue`
- `@texaryn/web-components`
- `@texaryn/angular`
- `@texaryn/svelte`
- `@texaryn/solid`
- `@texaryn/schema-zod`
- `@texaryn/collaboration-yjs`

Security fixes are released to the current `latest` dist-tag for every affected
package. Earlier releases do not receive backports. Upgrade each affected
package to its current `latest` release to receive the fix. Run
`npm view @texaryn/core version` to see the current core release.

The first stable release covers `@texaryn/core`, `@texaryn/schema-json`, and
`@texaryn/react`. The other public packages remain independently versioned
before 1.0 until their own compatibility contract is ready.

The six private workspace packages (`@texaryn/examples`,
`@texaryn/hints-rjsf`, `@texaryn/schema-json-hyperjump`,
`@texaryn/conformance-tests`, `@texaryn/docs`, and `@texaryn/playground`) are
not published to npm. A vulnerability in the documentation site or playground
can be reported through the same channel.

## Reporting a vulnerability

Do not report a vulnerability through a public issue, discussion, or pull
request.

Report it privately through GitHub private vulnerability reporting:

1. Open the **Security and quality** tab of this repository.
2. Select **Report a vulnerability**.
3. Fill in the form and submit it.

The form is also available at
<https://github.com/texaryn/texaryn/security/advisories/new>.

A useful report names the affected package and version, gives the smallest
schema, UI hints, or IR document that reproduces the problem, and describes the
impact.

## What happens after a report

Submitting the form creates a private vulnerability report. The maintainer
acknowledges the report and asks follow-up questions in its comments. Accepted
reports become draft security advisories while the fix is prepared. Reports
that describe no security risk are closed with an explanation.

When a fix is ready, each affected package receives a new release on `latest`.
The advisory is then published with the affected and patched versions, a CVE
when one applies, and reporter credit unless the reporter asks to stay
anonymous.

## Scope

The runtime executes no dynamic code: no `eval`, no `Function()`, and no
`innerHTML` assignment. A way to make the runtime or a renderer execute code or
inject HTML from a schema, UI hints, or an IR document is in scope.

Client-side validation is advisory. The runtime does not make submitted data
safe, and a server must validate every submission again. A way to get data past
client-side validation is not, on its own, a vulnerability.
