<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import NavigationMenu from '../../NavigationMenu.svelte';
  import type { NavMenuItem } from '../../NavigationMenu.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  const here = '/dev/design-system?section=navigation-menu';

  const items: NavMenuItem[] = [
    { id: 'docs', kind: 'group', label: 'Documentation', children: [
      { id: 'docs-start', kind: 'link', label: 'Getting started', href: here, external: false },
      { id: 'docs-blocks', kind: 'link', label: 'Blocks', href: here, external: false, active: true },
      { id: 'docs-auth', kind: 'link', label: 'Authorization', href: here, external: false },
    ] },
    { id: 'home', kind: 'link', label: 'Home', href: here, external: false, active: true },
    { id: 'graph', kind: 'link', label: 'Graph', href: here, external: false },
    { id: 'more', kind: 'group', label: 'More', children: [
      { id: 'more-changelog', kind: 'link', label: 'Changelog', href: here, external: false },
      { id: 'more-source', kind: 'link', label: 'Source (external)', href: 'https://example.org/', external: true },
    ] },
  ];

  const linksOnly: NavMenuItem[] = [
    { id: 'l-home', kind: 'link', label: 'Home', href: here, external: false, active: true },
    { id: 'l-graph', kind: 'link', label: 'Graph', href: here, external: false },
    { id: 'l-docs', kind: 'link', label: 'Docs', href: here, external: false },
  ];
</script>

<SpecimenGrid title="Desktop app-bar navigation">
  <Specimen label="links + groups; hover-intent (or focus + Enter) opens a group; active link highlighted" state="menu" overlay="hover" wide>
    <NavigationMenu {items} />
  </Specimen>
  <Specimen label="links only" state="links" wide>
    <NavigationMenu items={linksOnly} />
  </Specimen>
</SpecimenGrid>

<p class="caption">Desktop-only: the group submenus are anchored to their trigger, the wrong shape for a phone. The phone navigation is a BottomSheet with its own expand/collapse state per group.</p>

<style>
  .caption { margin: var(--ds-space-sm) 0 0; font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
</style>
