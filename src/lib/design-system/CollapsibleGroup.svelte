<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // One flush section with its own open state, for stacking in a narrow panel;
  // an Accordion is a framed group whose open state lives on the group.
  import { Collapsible as BitsCollapsible } from 'bits-ui';
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let {
    title,
    open = $bindable(true),
    onOpenChange,
    modified = false,
    modifiedTitle,
    class: className = '',
    children,
  }: {
    title: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Shows a dot: something inside differs from the default. */
    modified?: boolean;
    /** The dot's accessible text. */
    modifiedTitle?: string;
    class?: string;
    children?: Snippet;
  } = $props();
</script>

<BitsCollapsible.Root bind:open {onOpenChange}>
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <section {...props} class="ds-collapsible {className}">
      <h3 class="ds-collapsible-head">
        <BitsCollapsible.Trigger>
          {#snippet child({ props: triggerProps }: { props: Record<string, unknown> })}
            <button {...triggerProps} type="button" class="ds-collapsible-trigger">
              <span class="ds-collapsible-chevron"><Icon name="chevron" size={14} /></span>
              <span class="ds-collapsible-title">{title}</span>
              {#if modified}
                <span class="ds-collapsible-dot" title={modifiedTitle} aria-hidden="true"></span>
                {#if modifiedTitle}<span class="ds-collapsible-sr">{modifiedTitle}</span>{/if}
              {/if}
            </button>
          {/snippet}
        </BitsCollapsible.Trigger>
      </h3>
      <BitsCollapsible.Content>
        {#snippet child({ props: contentProps }: { props: Record<string, unknown> })}
          <div {...contentProps} class="ds-collapsible-content">
            {@render children?.()}
          </div>
        {/snippet}
      </BitsCollapsible.Content>
    </section>
  {/snippet}
</BitsCollapsible.Root>

<style>
  /* Not :global(): the elements are this template's own, through `child`
     (docs/architecture/design-system/primitives.md, "Styling Bits UI wrapper primitives"). */
  .ds-collapsible { border-bottom: 1px solid var(--ds-color-border); }
  .ds-collapsible-head { margin: 0; font: inherit; }
  .ds-collapsible-trigger {
    all: unset;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
    box-sizing: border-box;
    min-height: var(--ds-target-min);
    padding: 0.55rem 0;
    cursor: pointer;
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-sm);
    font-weight: var(--ds-weight-semibold);
    color: var(--ds-color-fg);
    /* No border: the radius only rounds the focus ring. */
    border-radius: var(--ds-radius-sm);
  }
  .ds-collapsible-trigger:hover .ds-collapsible-title { color: var(--ds-color-accent); }
  /* `all: unset` swallows the app-wide focus ring (docs/architecture/design-system/tokens.md#focus-and-selection-rings). */
  .ds-collapsible-trigger:focus-visible {
    outline: var(--ds-focus-ring);
    outline-offset: var(--ds-focus-ring-offset);
  }
  .ds-collapsible-chevron { display: inline-flex; color: var(--ds-color-muted); transition: transform 0.15s ease; transform: rotate(-90deg); }
  .ds-collapsible-trigger[data-state='open'] .ds-collapsible-chevron { transform: rotate(0deg); }
  .ds-collapsible-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ds-collapsible-dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--ds-color-accent); margin-right: 0.15rem; }
  .ds-collapsible-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  /* The display follows data-state, not Bits UI's `hidden` attribute. */
  .ds-collapsible-content { display: none; padding: 0.15rem 0 0.75rem; }
  .ds-collapsible-content[data-state='open'] { display: block; }
</style>
