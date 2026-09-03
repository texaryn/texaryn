[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / Command

# Type Alias: Command

> **Command** = \{ `nodeId`: [`NodeId`](NodeId.md); `type`: `"SetValue"`; `value`: `unknown`; \} \| \{ `containerId`: [`NodeId`](NodeId.md); `index`: `number`; `type`: `"InsertItem"`; `value?`: `unknown`; \} \| \{ `containerId`: [`NodeId`](NodeId.md); `index`: `number`; `type`: `"RemoveItem"`; \} \| \{ `containerId`: [`NodeId`](NodeId.md); `from`: `number`; `to`: `number`; `type`: `"MoveItem"`; \} \| \{ `nodeId`: [`NodeId`](NodeId.md); `type`: `"SetTouched"`; \} \| \{ `type`: `"Submit"`; \} \| \{ `data?`: `unknown`; `type`: `"Reset"`; \}
