<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A page layout drawn from its data, one frame per tier. Beside its label
  // it is decoration, so it is hidden from assistive technology unless labelled.
  import { TIERS, type ColumnTemplate, type Tier } from '$lib/features/content';

  let { template, label = undefined }: { template: ColumnTemplate | null; label?: string } = $props();

  // In viewBox units.
  const FRAME: Record<Tier, number> = { desktop: 30, tablet: 20, phone: 11 };
  // Of a frame, for a flow's reading column.
  const FLOW_SHARE: Record<Tier, number> = { desktop: 0.55, tablet: 0.7, phone: 1 };
  const HEIGHT = 18;
  const SPACE = 3;
  const INSET = 2;
  const COLUMN_GAP = 1.5;
  const WIDTH = TIERS.reduce((w, tier) => w + FRAME[tier], 0) + SPACE * (TIERS.length - 1);

  interface Rect { x: number; w: number }
  interface Frame { x: number; w: number; columns: Rect[] }

  const frames = $derived.by<Frame[]>(() => {
    let x = 0;
    return TIERS.map((tier) => {
      const w = FRAME[tier];
      const inner = w - 2 * INSET;
      let columns: Rect[];
      if (!template) {
        const cw = inner * FLOW_SHARE[tier];
        columns = [{ x: x + INSET + (inner - cw) / 2, w: cw }];
      } else {
        const ratios = template[tier];
        const total = ratios.reduce((a, b) => a + b, 0);
        const room = inner - COLUMN_GAP * (ratios.length - 1);
        let cx = x + INSET;
        columns = ratios.map((r) => {
          const cw = (room * r) / total;
          const rect = { x: cx, w: cw };
          cx += cw + COLUMN_GAP;
          return rect;
        });
      }
      const frame = { x, w, columns };
      x += w + SPACE;
      return frame;
    });
  });
</script>

<svg
  class="thumb"
  viewBox="0 0 {WIDTH} {HEIGHT}"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
>
  {#each frames as frame, i (i)}
    <rect class="frame" x={frame.x + 0.5} y="0.5" width={frame.w - 1} height={HEIGHT - 1} rx="1.5" />
    {#each frame.columns as column, j (j)}
      <rect class="column" x={column.x} y={INSET} width={column.w} height={HEIGHT - 2 * INSET} rx="0.75" />
    {/each}
  {/each}
</svg>

<style>
  /* A line of text tall, in the viewBox's proportions. */
  .thumb { display: block; flex: none; height: 1.25rem; width: auto; aspect-ratio: 67 / 18; }
  .frame { fill: none; stroke: var(--ds-color-border-strong); stroke-width: 1; vector-effect: non-scaling-stroke; }
  .column { fill: var(--ds-color-muted); opacity: 0.55; }
</style>
