<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // One component for the editor's NodeView and the server-rendered page;
  // nothing hydrates (docs/architecture/blocks/node-embeds.md, "Collection and document blocks"). The
  // page's members were resolved for its reader, unreadable ones left out.
  import { untrack } from 'svelte';
  import type { Locale } from '$lib/paraglide/runtime';
  import { localize } from '$lib/platform/i18n/localizedText';
  import EntryList from '../../listing/EntryList.svelte';
  import { fill } from '../../listing/format';
  import { memberRows } from '../../listing/members';
  import type { EntryPlaceholder } from '../../listing/types';
  import type { CollectionBlockProps } from './view';
  import type { CollectionBlockData } from './model';

  let { mode, config, initial, source = null, texts, locale, class: className = '', ...rest }: CollectionBlockProps = $props();

  let data = $state<CollectionBlockData | undefined>(untrack(() => initial));

  $effect(() => {
    const from = source;
    const id = config.nodeId;
    if (!from || !id) return;
    return untrack(() => from.watch(id, (next) => (data = next)));
  });

  const status = $derived(!config.nodeId ? 'unconfigured' : data === undefined ? (source ? 'loading' : 'unavailable') : data.state);

  const placeholder = $derived.by((): EntryPlaceholder | null => {
    if (status === 'unconfigured') return texts.editor ? { glyph: 'layers', editor: true, status: false, body: texts.editor.unconfigured } : { glyph: 'layers', status: true, body: texts.unavailable };
    if (status === 'hidden') return { glyph: 'layers', editor: !!texts.editor, status: true, body: texts.editor?.hidden ?? texts.unavailable };
    if (status === 'unavailable') return { glyph: 'layers', editor: !!texts.editor && data !== undefined, status: true, body: data !== undefined && texts.editor ? texts.editor.provided : texts.unavailable };
    return null;
  });

  const members = $derived(data?.state === 'members' ? data : null);
  // The page's resolver cuts to the limit already; the editor's source does not.
  const listed = $derived(members ? members.members.slice(0, config.limit) : []);
  const rows = $derived(
    members
      ? memberRows(
          listed.map((member) => ({
            id: member.id,
            type: member.type,
            title: member.title,
            href: member.href,
            label: config.showLabels ? localize(member.label, '', locale as Locale) || null : null,
            source: member.pluginLabel,
          })),
          { types: texts.types, kind: (type, source) => fill(texts.memberKind, { type, source }) },
          { link: mode === 'page' }
        )
      : []
  );
  const shown = $derived(listed.length);
  const total = $derived(members ? members.total : 0);
  const footer = $derived(
    !members ? '' : shown < total ? fill(texts.shownOf, { shown, total }) : fill(total === 1 ? texts.countOne : texts.countOther, { count: total })
  );
  const moreLink = $derived(
    members && shown < total ? { label: fill(texts.all, { count: total }), href: members.node.href, target: mode === 'editor' ? '_blank' : undefined } : null
  );
</script>

<EntryList
  {status}
  {mode}
  density={config.density}
  class={className}
  {placeholder}
  columns={{ name: texts.name, ...(config.columns.includes('kind') ? { kind: texts.kind } : {}) }}
  loading={status === 'loading'}
  {rows}
  empty={texts.empty}
  {footer}
  more={null}
  {moreLink}
  {...rest}
/>
