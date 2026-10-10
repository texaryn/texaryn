[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / Command

# Type Alias: Command

Serializable runtime commands.

`Command` includes value updates, array operations, interaction state changes,
submission, reset, and explicit projection boundary expansion.

## ExpandBoundary

```ts
{
  type: 'ExpandBoundary'
  containerId: NodeId
  targetToken: string
}
```

The runtime accepts this action only while the target token belongs to the
visible container. It recompiles the projection without changing form data.
