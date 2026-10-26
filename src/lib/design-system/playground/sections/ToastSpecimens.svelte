<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Button from '../../Button.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';
  import { toast } from '../../toast.svelte';

  let retries = $state(0);
</script>

<SpecimenGrid title="Tones (the stack is the app's own Toaster, bottom-right)">
  <Specimen label="danger: stays until dismissed, announced assertively" state="danger">
    <Button size="sm" onclick={() => toast.error('The page could not be saved. Your changes are still here.', { action: { label: 'Try again', onClick: () => retries++ } })}>Show error with action</Button>
    <span class="count">retried {retries}×</span>
  </Specimen>
  <Specimen label="warning: leaves after 5s" state="warning">
    <Button size="sm" onclick={() => toast.warning('Some blocks were skipped because their type is unknown.')}>Show warning</Button>
  </Specimen>
  <Specimen label="info: leaves after 5s" state="info">
    <Button size="sm" onclick={() => toast.info('The page was moved to the Handbook namespace.')}>Show info</Button>
  </Specimen>
  <Specimen label="success: only when nothing visible changes" state="success">
    <Button size="sm" onclick={() => toast.success('Link copied.')}>Show success</Button>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Stacking">
  <Specimen label="the same message again restarts it instead of stacking a copy" state="dedupe">
    <Button size="sm" onclick={() => toast.info('Same message.')}>Show the same info</Button>
  </Specimen>
  <Specimen label="five at once: three show, two wait their turn" state="queue">
    <Button size="sm" onclick={() => { for (let i = 1; i <= 5; i++) toast.info(`Queued message ${i} of 5.`); }}>Show five</Button>
  </Specimen>
  <Specimen label="a long message wraps" state="long">
    <Button size="sm" onclick={() => toast.error('The image could not be uploaded because the server rejected a file of this type; try a PNG, JPEG, WebP, GIF or SVG under 8 MB.')}>Show a long error</Button>
  </Specimen>
</SpecimenGrid>

<style>
  .count { font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
</style>
