<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The file block's Display section. Block attrs, not capabilities: they hold
  // for every viewport, whatever the tier switcher shows.
  import { FieldRow, SegmentedControl, SegmentedControlItem, Select, Switch } from '$lib/design-system';
  import type { PluginSectionProps } from '$lib/plugins/api';
  import { t } from '../../messages';
  import { fileConfig } from './model';

  let { target }: PluginSectionProps = $props();

  const config = $derived(fileConfig(target.attrs));
  const titleItems = $derived([
    { value: 'auto', label: t('file_display_title_auto') },
    { value: 'node', label: t('file_display_title_node') },
    { value: 'filename', label: t('file_display_title_filename') },
  ]);
</script>

<FieldRow layout="stack" label={t('file_display_variant')}>
  <SegmentedControl type="single" size="sm" stretch value={config.variant} ariaLabel={t('file_display_variant')}>
    <SegmentedControlItem value="row" onclick={() => target.update({ variant: 'row' })}>{t('file_display_row')}</SegmentedControlItem>
    <SegmentedControlItem value="card" onclick={() => target.update({ variant: 'card' })}>{t('file_display_card')}</SegmentedControlItem>
  </SegmentedControl>
</FieldRow>
<FieldRow layout="stack" label={t('file_display_title')}>
  <Select size="sm" width="full" items={titleItems} value={config.titleMode} ariaLabel={t('file_display_title')} onValueChange={(v) => target.update({ titleMode: v })} />
</FieldRow>
<FieldRow layout="stack" label={t('file_display_preview')}>
  <SegmentedControl type="single" size="sm" stretch value={config.preview} ariaLabel={t('file_display_preview')}>
    <SegmentedControlItem value="auto" onclick={() => target.update({ preview: 'auto' })}>{t('file_display_preview_auto')}</SegmentedControlItem>
    <SegmentedControlItem value="none" onclick={() => target.update({ preview: 'none' })}>{t('file_display_preview_none')}</SegmentedControlItem>
  </SegmentedControl>
</FieldRow>
<FieldRow label={t('file_display_meta')}>
  <Switch size="sm" checked={config.showMeta} onCheckedChange={(v) => target.update({ showMeta: v })} ariaLabel={t('file_display_meta')} />
</FieldRow>
<FieldRow label={t('file_display_download')}>
  <Switch size="sm" checked={config.showDownload} onCheckedChange={(v) => target.update({ showDownload: v })} ariaLabel={t('file_display_download')} />
</FieldRow>
<FieldRow label={t('file_display_node_link')}>
  <Switch size="sm" checked={config.showNodeLink} onCheckedChange={(v) => target.update({ showNodeLink: v })} ariaLabel={t('file_display_node_link')} />
</FieldRow>
