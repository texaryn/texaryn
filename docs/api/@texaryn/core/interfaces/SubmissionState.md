[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / SubmissionState

# Interface: SubmissionState

## Properties

### attempts

> **attempts**: `number`

Accepted Submit commands since creation or the last Reset; above zero, invalid fields show their errors before they are touched.

***

### cancelled?

> `optional` **cancelled?**: `true`

Set when a data command arrived during submit validation and abandoned the attempt.

***

### error?

> `optional` **error?**: `unknown`

***

### status

> **status**: `"idle"` \| `"validating"` \| `"submitting"` \| `"submitted"`
