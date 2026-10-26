<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // No rich content: all text is plain interpolation, the only markup <a>/<img>
  // from validated hrefs. The strip always ends with the link to /-/about
  // (AGPL-3.0 §13), which no footer setting removes (docs/architecture/settings.md, "The footer").
  import { Icon } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import type { ResolvedFooter } from '../types';

  let {
    footer,
    logoRuleId,
  }: {
    footer: ResolvedFooter;
    /** The logo height's rule in the per-page stylesheet: the reader's routes carry no style attributes. */
    logoRuleId?: string;
  } = $props();

  const hasMain = $derived(footer.columns.length > 0 || !!footer.branding);
  const hasLegal = $derived(!!footer.legalText || footer.legalLinks.length > 0);
  const aboutLabel = $derived(m.shell_about_software());
</script>

<footer class="site-footer" class:minimal={!hasMain && !hasLegal}>
  {#if hasMain}
    <div class="footer-inner">
      <div class="footer-main">
        {#if footer.branding}
          <div class="branding">
            {#if footer.branding.showLogo && footer.branding.logoUrl}
              <img class="brand-logo" src={footer.branding.logoUrl} alt="" data-b={logoRuleId || undefined} />
            {/if}
            {#if footer.branding.title}<span class="brand-title">{footer.branding.title}</span>{/if}
            {#if footer.branding.tagline}<span class="brand-tagline">{footer.branding.tagline}</span>{/if}
          </div>
        {/if}
        {#if footer.columns.length > 0}
          <div class="columns">
            {#each footer.columns as col (col.id)}
              <div class="column">
                <h2>{col.label}</h2>
                <ul>
                  {#each col.children as link (link.id)}
                    <li>
                      <a href={link.href} target={link.external ? '_blank' : undefined} rel={link.external ? 'noopener' : undefined}>
                        {link.label}
                      </a>
                    </li>
                  {/each}
                </ul>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <div class="legal">
    {#if footer.legalText}<span class="legal-text">{footer.legalText}</span>{/if}
    {#if footer.legalLinks.length > 0}
      <ul class="legal-links">
        {#each footer.legalLinks as link (link.id)}
          <li>
            <a href={link.href} target={link.external ? '_blank' : undefined} rel={link.external ? 'noopener' : undefined}>
              {link.label}
            </a>
          </li>
        {/each}
      </ul>
    {/if}
    <a class="about-link" href="/-/about" title={aboutLabel} aria-label={aboutLabel}><Icon name="info" /></a>
  </div>
</footer>

<style>
  .site-footer {
    /* On an admin-chosen ground every text takes the colour that reads on it,
       since muted and accent aren't checked against it. Unset, the footer is plain. */
    --footer-fg: var(--ds-footer-fg);
    --footer-muted: var(--ds-footer-muted);
    --footer-accent: var(--ds-footer-accent);
    --footer-border: var(--ds-footer-border);
    --ds-focus-ring-color: var(--ds-footer-accent);
    border-top: 1px solid var(--footer-border);
    background: var(--ds-footer-bg);
    font-size: 0.88rem;
    color: var(--footer-muted);
  }
  /* Nothing configured: the icon alone on the page's surface, so in the page's
     colours; a footer colour was picked for a ground that isn't shown. */
  .site-footer.minimal {
    --footer-muted: var(--ds-color-muted);
    --footer-accent: var(--ds-color-accent);
    --ds-focus-ring-color: var(--ds-color-accent);
    border-top: none;
    background: none;
  }
  .footer-inner { padding: 2.5rem 1.25rem 2rem; }
  .footer-main { display: flex; flex-wrap: wrap; gap: 2.5rem; justify-content: space-between; margin-bottom: 1.5rem; }

  .branding { display: flex; flex-direction: column; align-items: flex-start; gap: 0.4rem; flex: 1 1 200px; min-width: 180px; }
  .brand-logo { width: auto; max-width: 240px; object-fit: contain; }
  .brand-title { font-weight: 600; color: var(--footer-fg); }
  .brand-tagline { color: var(--footer-muted); font-size: 0.85rem; }

  .columns { display: flex; flex-wrap: wrap; gap: 2.5rem; flex: 2 1 auto; }
  .column { min-width: 140px; }
  .column h2 { font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em; color: var(--footer-fg); margin: 0 0 0.7rem; }
  .column ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .column a { color: var(--footer-muted); text-decoration: none; }
  .column a:hover { color: var(--footer-accent); text-decoration: underline; }

  .legal {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 1.2rem;
    padding-top: 1.2rem;
    padding-bottom: 1.2rem;
    padding-left: 1.25rem;
    padding-right: 1.25rem;
    font-size: 0.82rem;
  }
  .footer-inner + .legal { border-top: 1px solid var(--footer-border); }
  .legal-links { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 1.2rem; }
  .legal-links a { color: var(--footer-muted); text-decoration: none; }
  .legal-links a:hover { color: var(--footer-accent); text-decoration: underline; }

  /* A 44px target around the 18px glyph: padding makes the target, the negative
     margin keeps the strip as tall as its text. */
  .about-link {
    --about-hit: calc((var(--ds-control-h-lg) - 1.125rem) / 2);
    display: inline-flex;
    padding: var(--about-hit);
    margin-block: calc(-1 * var(--about-hit));
    margin-inline: auto calc(-1 * var(--about-hit));
    border-radius: var(--ds-radius-sm);
    color: var(--footer-muted);
  }
  .about-link:hover { color: var(--footer-accent); background: color-mix(in srgb, currentColor 12%, transparent); }

  /* ui-check-allow: shell-media — the footer’s gaps follow the window’s width, not the shell */
  @media (max-width: 640px) {
    .footer-main { gap: 1.8rem; }
    .columns { gap: 1.8rem; }
  }
</style>
