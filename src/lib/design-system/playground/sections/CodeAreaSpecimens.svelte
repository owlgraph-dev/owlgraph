<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import CodeArea from '../../CodeArea.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';
  // The app's shared highlighter, so a specimen shows what a consumer gets.
  import { highlightToHtml } from '$lib/features/content';

  const css = (source: string) => highlightToHtml(source, 'css');

  let styles = $state('.lead {\n  font-size: 1.15rem;\n  color: var(--content-muted);\n}');
  let declarations = $state('background: var(--content-accent-soft);\npadding: 0.1em 0.3em;\nborder-radius: 0.2em;');
  let long = $state('.wide { grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: 1rem }');
  // More lines than the box shows: the caret must stay on its line at every
  // scroll offset.
  let many = $state(
    Array.from({ length: 24 }, (_, i) => `.rule-${i + 1} { color: var(--content-fg); padding: ${i + 1}px }`).join('\n')
  );
</script>

<SpecimenGrid title="CodeArea">
  <Specimen label="highlighted (rows=6)" state="default">
    <CodeArea bind:value={styles} highlight={css} rows={6} ariaLabel="Stylesheet" />
  </Specimen>
  <Specimen label="declarations only, compact" state="compact">
    <CodeArea bind:value={declarations} highlight={css} rows={4} ariaLabel="Declarations" />
  </Specimen>
  <Specimen label="no highlighter (escaped plain text)" state="plain">
    <CodeArea value={'<b>&amp; escaped</b>\nplain text'} rows={3} ariaLabel="Plain" />
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="CodeArea — states">
  <Specimen label="placeholder (empty)" state="placeholder">
    <CodeArea value="" highlight={css} rows={3} placeholder="color: var(--content-fg);" ariaLabel="Empty" />
  </Specimen>
  <Specimen label="invalid" state="invalid">
    <CodeArea value={'.x { color: '} highlight={css} rows={3} invalid ariaLabel="Invalid" />
  </Specimen>
  <Specimen label="disabled" state="disabled">
    <CodeArea value={'.x { color: red }'} highlight={css} rows={3} disabled ariaLabel="Disabled" />
  </Specimen>
  <Specimen label="long line (scrolls, never wraps)" state="overflow">
    <CodeArea bind:value={long} highlight={css} rows={3} ariaLabel="Long line" />
  </Specimen>
  <Specimen label="more lines than fit (highlight scrolls with the caret)" state="scrolling">
    <CodeArea bind:value={many} highlight={css} rows={5} ariaLabel="Many lines" />
  </Specimen>
</SpecimenGrid>
