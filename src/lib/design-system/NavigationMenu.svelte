<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The group chevron is Feather's chevron-down (MIT; THIRD-PARTY-NOTICES.md).
  // Desktop header navigation; the app bar maps its tree into `items`. No shared
  // `Viewport`: it stays left-aligned to the whole bar, while without one each
  // group's Content renders in place under its own trigger.
  import { NavigationMenu as BitsNavigationMenu } from 'bits-ui';

  export type NavMenuLink = { id: string; kind: 'link'; label: string; href: string; external: boolean; active?: boolean };
  export type NavMenuGroup = { id: string; kind: 'group'; label: string; children: NavMenuLink[] };
  export type NavMenuItem = NavMenuLink | NavMenuGroup;

  let {
    items,
    class: className = '',
  }: {
    items: NavMenuItem[];
    class?: string;
  } = $props();
</script>

<BitsNavigationMenu.Root>
  {#snippet child({ props: rootProps }: { props: Record<string, unknown> })}
    <!-- bits-ui puts aria-label="main" on this role-less div, which ARIA
         prohibits; the landmark name belongs to the consumer's <nav>. -->
    <div {...rootProps} aria-label={undefined} class="ds-navmenu-root {className}">
      <BitsNavigationMenu.List>
        {#snippet child({ props: listProps, wrapperProps }: { props: Record<string, unknown>; wrapperProps: Record<string, unknown> })}
          <div {...wrapperProps}>
            <ul {...listProps} class="ds-navmenu-list">
              {#each items as item (item.id)}
                <BitsNavigationMenu.Item value={item.id}>
                  {#snippet child({ props: itemProps }: { props: Record<string, unknown> })}
                    <li {...itemProps} class="ds-navmenu-item">
                      {#if item.kind === 'link'}
                        <BitsNavigationMenu.Link
                          href={item.href}
                          active={item.active}
                          target={item.external ? '_blank' : undefined}
                          rel={item.external ? 'noopener' : undefined}
                        >
                          {#snippet child({ props: linkProps }: { props: Record<string, unknown> })}
                            <a {...linkProps} class="ds-navmenu-link" class:ds-navmenu-active={item.active}>{item.label}</a>
                          {/snippet}
                        </BitsNavigationMenu.Link>
                      {:else}
                        <BitsNavigationMenu.Trigger>
                          {#snippet child({ props: triggerProps }: { props: Record<string, unknown> })}
                            <button {...triggerProps} class="ds-navmenu-trigger">
                              {item.label}
                              <svg class="ds-navmenu-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </button>
                          {/snippet}
                        </BitsNavigationMenu.Trigger>
                        <BitsNavigationMenu.Content>
                          {#snippet child({ props: contentProps }: { props: Record<string, unknown> })}
                            <div {...contentProps} class="ds-navmenu-content">
                              <ul class="ds-navmenu-sublist">
                                {#each item.children as childLink (childLink.id)}
                                  <li>
                                    <BitsNavigationMenu.Link
                                      href={childLink.href}
                                      active={childLink.active}
                                      target={childLink.external ? '_blank' : undefined}
                                      rel={childLink.external ? 'noopener' : undefined}
                                    >
                                      {#snippet child({ props: subLinkProps }: { props: Record<string, unknown> })}
                                        <a {...subLinkProps} class="ds-navmenu-sublink" class:ds-navmenu-active={childLink.active}>{childLink.label}</a>
                                      {/snippet}
                                    </BitsNavigationMenu.Link>
                                  </li>
                                {/each}
                              </ul>
                            </div>
                          {/snippet}
                        </BitsNavigationMenu.Content>
                      {/if}
                    </li>
                  {/snippet}
                </BitsNavigationMenu.Item>
              {/each}
            </ul>
          </div>
        {/snippet}
      </BitsNavigationMenu.List>
    </div>
  {/snippet}
</BitsNavigationMenu.Root>

<style>
  /* Not :global(): the elements are this template's own, through `child`
     (docs/architecture/design-system/primitives.md, "Styling Bits UI wrapper primitives"). */
  .ds-navmenu-root { position: relative; }
  .ds-navmenu-list { display: flex; align-items: center; gap: 0.2rem; list-style: none; margin: 0; padding: 0; }
  /* Anchors each group's Content to its own trigger. */
  .ds-navmenu-item { position: relative; }

  .ds-navmenu-link, .ds-navmenu-trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: var(--ds-target-min);
    padding: 0.4rem 0.7rem;
    border: 0;
    border-radius: var(--ds-radius-md);
    background: none;
    color: var(--ds-color-fg);
    text-decoration: none;
    font: inherit;
    font-size: var(--ds-text-md);
    white-space: nowrap;
    cursor: pointer;
  }
  /* The current item keeps its accent tint on hover: accent text on the grey
     fill falls under 4.5:1. */
  .ds-navmenu-link:hover, .ds-navmenu-trigger:hover { background: var(--ds-color-fill-hover); }
  .ds-navmenu-link:active, .ds-navmenu-trigger:active { background: var(--ds-color-fill-pressed); }
  .ds-navmenu-active, .ds-navmenu-active:hover { background: var(--ds-color-accent-soft); color: var(--ds-color-accent); }
  .ds-navmenu-active:active { background: var(--ds-color-accent-soft-pressed); }
  .ds-navmenu-chevron { transition: transform 0.15s ease; }
  .ds-navmenu-trigger[data-state='open'] .ds-navmenu-chevron { transform: rotate(180deg); }

  .ds-navmenu-content {
    /* A surface of the page, not of the branded app bar it hangs from: take
       the page's colours back (--ds-page-*, tokens.ts). */
    --ds-color-fg: var(--ds-page-fg);
    --ds-color-muted: var(--ds-page-muted);
    --ds-color-accent: var(--ds-page-accent);
    --ds-color-accent-soft: var(--ds-page-accent-soft);
    --ds-color-accent-soft-pressed: var(--ds-page-accent-soft-pressed);
    --ds-color-on-accent: var(--ds-page-on-accent);
    --ds-color-border: var(--ds-page-border);
    --ds-color-fill-hover: var(--ds-page-fill-hover);
    --ds-color-fill-pressed: var(--ds-page-fill-pressed);
    --ds-focus-ring-color: var(--ds-page-accent);
    color: var(--ds-color-fg);
    position: absolute;
    top: 100%;
    left: 0;
    z-index: var(--ds-z-nav);
    margin-top: 0.4rem;
    transform-origin: top left;
    min-width: 200px;
    background: var(--ds-color-raised-floating);
    border: 1px solid var(--ds-color-border-elevated);
    border-radius: var(--ds-radius-md);
    box-shadow: var(--ds-shadow-md);
    padding: 0.4rem;
    font-family: var(--ds-font-sans);
  }
  .ds-navmenu-content[data-state='open'] { animation: ds-navmenu-in 0.12s ease; }
  .ds-navmenu-content[data-state='closed'] { animation: ds-navmenu-out 0.1s ease; }
  .ds-navmenu-sublist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .ds-navmenu-sublink {
    display: block;
    padding: 0.45rem 0.6rem;
    border-radius: var(--ds-radius-sm);
    color: var(--ds-color-fg);
    text-decoration: none;
    font-size: var(--ds-text-md);
  }
  .ds-navmenu-sublink:hover { background: var(--ds-color-fill-hover); }
  .ds-navmenu-sublink:active { background: var(--ds-color-fill-pressed); }
  .ds-navmenu-sublink.ds-navmenu-active { background: var(--ds-color-accent-soft); }
  .ds-navmenu-sublink.ds-navmenu-active:active { background: var(--ds-color-accent-soft-pressed); }

  @keyframes ds-navmenu-in {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes ds-navmenu-out {
    from { opacity: 1; }
    to { opacity: 0; }
  }
</style>
