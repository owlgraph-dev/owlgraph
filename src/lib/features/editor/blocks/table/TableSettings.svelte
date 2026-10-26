<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { FieldRow, Switch } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import BlockSettingsSection from '../../blockSettings/BlockSettingsSection.svelte';
  import { anyAttrModified } from '../../blockSettings/modified';
  import { labelFor } from '../../blockSettings/blockLabels';
  import type { BlockSettingsProps } from '../../blockSettings/types';

  let { target, editor }: BlockSettingsProps = $props();
</script>

<BlockSettingsSection id="block" title={labelFor(target.type)} modified={anyAttrModified(editor, target.type, target.attrs, ['showHeader'])}>
  <FieldRow label={m.editor_block_settings_table_show_header()} info={m.editor_block_settings_table_hint()}>
    <Switch checked={target.attrs.showHeader !== false} onCheckedChange={(v) => target.update({ showHeader: v })} ariaLabel={m.editor_block_settings_table_show_header()} />
  </FieldRow>
</BlockSettingsSection>
