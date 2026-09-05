[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / SubmissionState

# Interface: SubmissionState

## Properties

### attempts

> **attempts**: `number`

Accepted Submit commands since creation or the last Reset; above zero, invalid fields show their errors before they are touched.

***

### error?

> `optional` **error?**: `unknown`

***

### status

> **status**: `"idle"` \| `"validating"` \| `"submitting"` \| `"submitted"`
