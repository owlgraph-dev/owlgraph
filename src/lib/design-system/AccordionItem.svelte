<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The header's chevron is Lucide's chevron-down (ISC; THIRD-PARTY-NOTICES.md).
  import { Accordion as BitsAccordion } from 'bits-ui';
  import type { Snippet } from 'svelte';

  let {
    value,
    title,
    disabled = false,
    size = 'md',
    class: className = '',
    children,
  }: {
    value: string;
    title: string;
    disabled?: boolean;
    /** `sm`: a secondary section among a dialog's own fields. */
    size?: 'sm' | 'md';
    class?: string;
    children?: Snippet;
  } = $props();
</script>

<BitsAccordion.Item {value} {disabled}>
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <div {...props} class="ds-accordion-item ds-accordion-item-{size} {className}">
      <BitsAccordion.Header>
        {#snippet child({ props: headerProps }: { props: Record<string, unknown> })}
          <div {...headerProps} class="ds-accordion-header">
            <BitsAccordion.Trigger>
              {#snippet child({ props: triggerProps }: { props: Record<string, unknown> })}
                <button {...triggerProps} type="button" class="ds-accordion-trigger">
                  <span>{title}</span>
                  <svg class="ds-accordion-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              {/snippet}
            </BitsAccordion.Trigger>
          </div>
        {/snippet}
      </BitsAccordion.Header>
      <BitsAccordion.Content>
        {#snippet child({ props: contentProps }: { props: Record<string, unknown> })}
          <div {...contentProps} class="ds-accordion-content">
            {@render children?.()}
          </div>
        {/snippet}
      </BitsAccordion.Content>
    </div>
  {/snippet}
</BitsAccordion.Item>

<style>
  /* Not :global(): the elements are this template's own, through `child`
     (docs/architecture/design-system/primitives.md, "Styling Bits UI wrapper primitives"). */
  .ds-accordion-item { border-bottom: 1px solid var(--ds-color-border); }
  .ds-accordion-item:last-child { border-bottom: 0; }
  .ds-accordion-header { margin: 0; }
  .ds-accordion-trigger {
    all: unset;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    box-sizing: border-box;
    min-height: var(--ds-target-min);
    padding: var(--ds-space-sm) var(--ds-space-md);
    cursor: pointer;
    font: inherit;
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-md);
    font-weight: var(--ds-weight-semibold);
    color: var(--ds-color-fg);
  }
  .ds-accordion-trigger:not(:disabled):hover { color: var(--ds-color-accent); }
  /* `all: unset` swallows the app-wide focus ring (docs/architecture/design-system/tokens.md#focus-and-selection-rings). */
  .ds-accordion-trigger:focus-visible {
    outline: var(--ds-focus-ring);
    outline-offset: var(--ds-focus-ring-offset);
  }
  .ds-accordion-trigger:disabled { opacity: var(--ds-opacity-disabled); cursor: default; }
  .ds-accordion-chevron { flex: none; color: var(--ds-color-muted); transition: transform 0.15s ease; }
  .ds-accordion-trigger[data-state='open'] .ds-accordion-chevron { transform: rotate(180deg); }
  /* The display follows data-state, not Bits UI's `hidden` attribute. */
  .ds-accordion-content { display: none; padding: 0 var(--ds-space-md) var(--ds-space-md); }
  .ds-accordion-content[data-state='open'] { display: block; }

  /* Muted at rest, among a dialog's muted labels. */
  .ds-accordion-item-sm .ds-accordion-trigger {
    padding: 0.55rem 0.75rem;
    font-size: var(--ds-text-sm);
    font-weight: var(--ds-weight-medium);
    color: var(--ds-color-muted);
  }
  .ds-accordion-item-sm .ds-accordion-trigger:not(:disabled):hover,
  .ds-accordion-item-sm .ds-accordion-trigger[data-state='open'] { color: var(--ds-color-fg); }
  .ds-accordion-item-sm .ds-accordion-content { padding: 0 0.75rem 0.75rem; }
</style>
