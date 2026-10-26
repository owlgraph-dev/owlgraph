<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Bits UI's input has no onValueChange: pass a native `oninput` through ...rest.
  import { Command as BitsCommand } from 'bits-ui';

  let {
    value = $bindable(''),
    placeholder,
    autofocus = false,
    class: className = '',
    ...rest
  }: {
    value?: string;
    placeholder?: string;
    autofocus?: boolean;
    class?: string;
    [key: string]: unknown;
  } = $props();
</script>

<BitsCommand.Input bind:value {placeholder} {autofocus} {...rest}>
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <!-- bind:value here too: with `child`, Bits UI's own <input> never mounts.
         bits-ui fills aria-controls only from a Command.Viewport, which isn't
         rendered here: a consumer passes it through ...rest with its list's id. -->
    <input {...props} bind:value class="ds-command-input {className}" />
  {/snippet}
</BitsCommand.Input>

<style>
  .ds-command-input {
    flex: 1;
    border: 0;
    background: none;
    font: inherit;
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-lg);
    color: var(--ds-color-fg);
    box-sizing: border-box;
    /* The field itself is the target, not the frame around it: 44px on touch. */
    min-height: var(--ds-target-min);
    padding: 0.3rem 0;
  }
</style>
