<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The builder's one source picker, for conditions, sorting and the mapping;
  // sourceOptions.ts builds its groups per context.
  import { Select } from '$lib/design-system';
  import type { SourceGroup } from './sourceOptions';

  let {
    value,
    onChange,
    groups,
    placeholder,
    ariaLabel,
    disabled = false
  }: {
    value: string;
    onChange: (value: string) => void;
    groups: SourceGroup[];
    placeholder: string;
    ariaLabel: string;
    disabled?: boolean;
  } = $props();
</script>

<Select {groups} {value} onValueChange={(v) => { if (v && v !== value) onChange(v); }} {placeholder} {ariaLabel} {disabled} width="full" />
