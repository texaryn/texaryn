<script lang="ts">
  import { writable } from 'svelte/store'
  import type { FieldNode, UINode } from '@texaryn/core'
  import { useFormContext } from '../context.js'
  import { createFieldBinding, sameEnumValue } from '../field.js'
  import FieldErrors from './FieldErrors.svelte'

  export let node: UINode

  const context = useFormContext()
  const nodeId = writable(node.id)
  $: nodeId.set(node.id)

  const field = createFieldBinding(context.form, nodeId, context.idPrefix, context.messages)
  const {
    node: fieldNode,
    value,
    visibleErrors,
    display,
    label,
    description,
    labelFor,
    descriptionId,
    errorId,
    aria,
    messages,
  } = field

  $: enumOptions = ($fieldNode?.enumValues ?? []).map((entry, index) => ({
    token: String(index),
    value: entry.value,
    title: entry.title ?? String(entry.value),
  }))
  $: selectedToken = enumOptions.find((option) => sameEnumValue(option.value, $value))?.token ?? ''

  function handleInput(event: Event): void {
    field.setRaw((event.currentTarget as HTMLInputElement | HTMLTextAreaElement).value)
  }

  function handleSelect(event: Event): void {
    const select = event.currentTarget as HTMLSelectElement
    if ($fieldNode?.readOnly) {
      select.value = selectedToken
      return
    }
    field.setRaw(select.value, select.value)
  }

  function handleCheckbox(event: Event): void {
    const checkbox = event.currentTarget as HTMLInputElement
    if ($fieldNode?.readOnly) {
      checkbox.checked = Boolean($value)
      return
    }
    field.setValue(checkbox.checked)
  }

  function handleBlur(): void {
    field.onBlur()
  }
</script>

{#if $fieldNode && $aria}
  <div>
    <label for={$labelFor}>
      {#if $aria['aria-required'] && $messages.requiredIndicator().placement === 'before'}
        {@const indicator = $messages.requiredIndicator()}
        <span aria-hidden="true">{indicator.text} </span>
      {/if}
      {$label}
      {#if $aria['aria-required'] && $messages.requiredIndicator().placement === 'after'}
        {@const indicator = $messages.requiredIndicator()}
        <span aria-hidden="true"> {indicator.text}</span>
      {/if}
    </label>

    {#if $fieldNode.enumValues != null && $fieldNode.enumValues.length > 0}
      <select {...$aria} value={selectedToken} on:change={handleSelect} on:blur={handleBlur}>
        <option value=""></option>
        {#each enumOptions as option (option.token)}
          <option value={option.token}>{option.title}</option>
        {/each}
      </select>
    {:else if $fieldNode.fieldType === 'boolean'}
      <input
        {...$aria}
        type="checkbox"
        checked={Boolean($value)}
        on:change={handleCheckbox}
        on:blur={handleBlur}
      />
    {:else if $fieldNode.widget === 'textarea'}
      <textarea {...$aria} value={$display} on:input={handleInput} on:blur={handleBlur}></textarea>
    {:else}
      <input
        {...$aria}
        type={$fieldNode.fieldType === 'number' || $fieldNode.fieldType === 'integer' ? 'number' : 'text'}
        value={$display}
        on:input={handleInput}
        on:blur={handleBlur}
      />
    {/if}

    {#if $description}
      <div id={$descriptionId}>{$description}</div>
    {/if}
    <FieldErrors id={$errorId} errors={$visibleErrors} />
  </div>
{/if}
