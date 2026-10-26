<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The folder block's Display section. Block attrs, not capabilities: they hold
  // for every viewport, whatever the tier switcher shows.
  import { FieldRow, NumberField, SegmentedControl, SegmentedControlItem, Select, Switch } from '$lib/design-system';
  import type { PluginSectionProps } from '$lib/plugins/api';
  import { t } from '../../messages';
  import { folderConfig, MAX_FOLDER_PAGE_SIZE, type FolderSortDir, type FolderSortKey } from './model';

  let { target }: PluginSectionProps = $props();

  const config = $derived(folderConfig(target.attrs));
  const sortValue = $derived(`${config.sortKey}:${config.sortDir}`);
  const keyLabel: Record<FolderSortKey, () => string> = {
    name: () => t('folder_col_name'),
    modified: () => t('folder_col_modified'),
    size: () => t('folder_col_size'),
  };
  const dirLabel: Record<FolderSortDir, () => string> = { asc: () => t('folder_sort_asc'), desc: () => t('folder_sort_desc') };
  const sortItems = $derived(
    (['name:asc', 'name:desc', 'modified:desc', 'modified:asc', 'size:desc', 'size:asc'] as const).map((value) => {
      const [key, dir] = value.split(':') as [FolderSortKey, FolderSortDir];
      return { value, label: `${keyLabel[key]()}, ${dirLabel[dir]()}` };
    })
  );

  function setSort(value: string) {
    const [sortKey, sortDir] = value.split(':');
    target.update({ sortKey, sortDir });
  }
</script>

<FieldRow layout="stack" label={t('display_density')}>
  <SegmentedControl type="single" size="sm" stretch value={config.density} ariaLabel={t('display_density')}>
    <SegmentedControlItem value="compact" onclick={() => target.update({ density: 'compact' })}>{t('display_density_compact')}</SegmentedControlItem>
    <SegmentedControlItem value="normal" onclick={() => target.update({ density: 'normal' })}>{t('display_density_normal')}</SegmentedControlItem>
  </SegmentedControl>
</FieldRow>
<FieldRow layout="stack" label={t('display_sort')}>
  <Select size="sm" width="full" items={sortItems} value={sortValue} ariaLabel={t('display_sort')} onValueChange={setSort} />
</FieldRow>
<FieldRow label={t('display_column_size')}>
  <Switch size="sm" checked={config.showSize} onCheckedChange={(v) => target.update({ showSize: v })} ariaLabel={t('display_column_size')} />
</FieldRow>
<FieldRow label={t('display_column_modified')}>
  <Switch size="sm" checked={config.showModified} onCheckedChange={(v) => target.update({ showModified: v })} ariaLabel={t('display_column_modified')} />
</FieldRow>
<FieldRow label={t('display_navigate')} info={t('display_navigate_info')}>
  <Switch size="sm" checked={config.allowNavigate} onCheckedChange={(v) => target.update({ allowNavigate: v })} ariaLabel={t('display_navigate')} />
</FieldRow>
<FieldRow label={t('display_page_size')}>
  <NumberField
    size="sm"
    value={config.pageSize}
    min={1}
    max={MAX_FOLDER_PAGE_SIZE}
    ariaLabel={t('display_page_size')}
    onValueChange={(v) => v !== null && target.update({ pageSize: Math.min(Math.max(Math.round(v), 1), MAX_FOLDER_PAGE_SIZE) })}
  />
</FieldRow>
<FieldRow label={t('display_highlight')}>
  <Switch size="sm" checked={config.highlightLinked} onCheckedChange={(v) => target.update({ highlightLinked: v })} ariaLabel={t('display_highlight')} />
</FieldRow>
