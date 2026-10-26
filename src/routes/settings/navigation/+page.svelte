<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import TreeEditor from '$lib/features/site/routes/TreeEditor.svelte';
  import SettingsPageHead from '$lib/shell/SettingsPageHead.svelte';
  import * as m from '$lib/paraglide/messages';

  let { data, form } = $props();
</script>

<SettingsPageHead title={m.settings_navigation_title()} intro={m.settings_navigation_intro()} error={form?.error?.message ?? null} />

<TreeEditor
  nodes={data.nodes}
  allowTopLevelLinks={true}
  createAction="?/create"
  updateAction="?/update"
  deleteAction="?/delete"
  moveAction="?/move"
  indentAction="?/indent"
  outdentAction="?/outdent"
/>
