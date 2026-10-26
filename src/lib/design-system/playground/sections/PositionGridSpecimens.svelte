<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import PositionGrid, { type Position } from '../../PositionGrid.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  const labels: Record<Position, string> = {
    'top-left': 'Top left',
    top: 'Top',
    'top-right': 'Top right',
    left: 'Left',
    center: 'Centre',
    right: 'Right',
    'bottom-left': 'Bottom left',
    bottom: 'Bottom',
    'bottom-right': 'Bottom right',
  };
  let focus = $state<Position>('center');
  let corner = $state<Position>('top-right');
</script>

<SpecimenGrid title="states">
  <Specimen label="center" state="center">
    <PositionGrid value={focus} onValueChange={(v) => (focus = v)} {labels} ariaLabel="Focus point" />
  </Specimen>
  <Specimen label="corner" state="corner">
    <PositionGrid value={corner} onValueChange={(v) => (corner = v)} {labels} ariaLabel="Focus point" />
  </Specimen>
  <Specimen label="disabled" state="disabled">
    <PositionGrid value="center" disabled {labels} ariaLabel="Focus point" />
  </Specimen>
</SpecimenGrid>
