<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { Slider as BitsSlider } from 'bits-ui';

  let {
    value = $bindable(0),
    onValueChange,
    onValueCommit,
    min = 0,
    max = 100,
    step = 1,
    disabled = false,
    ariaLabel,
    class: className = '',
  }: {
    value?: number;
    /** Every step while dragging. */
    onValueChange?: (value: number) => void;
    /** Once, on release: for a consumer whose reaction is expensive. */
    onValueCommit?: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    ariaLabel?: string;
    class?: string;
  } = $props();
</script>

<BitsSlider.Root type="single" bind:value {onValueChange} {onValueCommit} {min} {max} {step} {disabled} thumbPositioning="exact">
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <span {...props} class="ds-slider {className}">
      <span class="ds-slider-track">
        <BitsSlider.Range>
          {#snippet child({ props: rangeProps }: { props: Record<string, unknown> })}
            <span {...rangeProps} class="ds-slider-range"></span>
          {/snippet}
        </BitsSlider.Range>
      </span>
      <BitsSlider.Thumb index={0} aria-label={ariaLabel}>
        {#snippet child({ props: thumbProps }: { props: Record<string, unknown> })}
          <span {...thumbProps} class="ds-slider-thumb"></span>
        {/snippet}
      </BitsSlider.Thumb>
    </span>
  {/snippet}
</BitsSlider.Root>

<style>
  /* The thumb's centre sits exactly on its value, the ends included, so the
     root is inset by half the thumb: it never pokes out of the box. */
  .ds-slider {
    /* The thumb's target: 24px, or --ds-target-min on touch. */
    --ds-slider-thumb: max(1.5rem, var(--ds-target-min));
    position: relative;
    display: flex;
    align-items: center;
    width: calc(100% - var(--ds-slider-thumb));
    margin-inline: calc(var(--ds-slider-thumb) / 2);
    height: max(1.4rem, var(--ds-target-min));
    touch-action: none;
    user-select: none;
  }
  .ds-slider[data-disabled] { opacity: var(--ds-opacity-disabled); }
  .ds-slider[data-disabled] .ds-slider-thumb { cursor: default; }
  .ds-slider-track {
    position: relative;
    width: 100%;
    height: 4px;
    border-radius: var(--ds-radius-pill);
    /* The track is the control's boundary; 3:1 against the page. */
    background: var(--ds-color-border-strong);
    overflow: hidden;
  }
  .ds-slider-range {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--ds-color-accent);
  }
  /* The 24px target (WCAG 2.5.8) with the focus ring; the knob is its ::before.
     Bits UI centres it along the track; this centres it across. */
  .ds-slider-thumb {
    position: absolute;
    top: 50%;
    width: var(--ds-slider-thumb);
    height: var(--ds-slider-thumb);
    box-sizing: border-box;
    transform: translateY(-50%);
    border-radius: 50%;
    cursor: grab;
  }
  .ds-slider-thumb::before {
    content: '';
    position: absolute;
    inset: calc((var(--ds-slider-thumb) - 0.95rem) / 2);
    box-sizing: border-box;
    border-radius: 50%;
    background: var(--ds-color-raised);
    border: 2px solid var(--ds-color-accent);
    box-shadow: var(--ds-shadow-sm);
  }
  .ds-slider:not([data-disabled]) .ds-slider-thumb:hover::before { border-color: var(--ds-color-accent-hover); }
  .ds-slider:not([data-disabled]) .ds-slider-thumb:active::before,
  .ds-slider:not([data-disabled]) .ds-slider-thumb[data-active]::before { border-color: var(--ds-color-accent-pressed); }
  .ds-slider-thumb[data-active] { cursor: grabbing; }
</style>
