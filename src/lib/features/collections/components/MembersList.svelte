<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The same rows a page's collection block draws (memberRows). Read-only: the
  // members are arranged in the collection's editor.
  import { EntryList, memberRows } from '$lib/features/content/listing';
  import * as m from '$lib/paraglide/messages';
  import type { CollectionMember } from '../types';

  let { members, empty }: { members: CollectionMember[]; empty: string } = $props();

  const rows = $derived(
    memberRows(
      members.map((member) => ({ id: member.id, type: member.type, title: member.title, href: member.url, label: member.label, source: member.pluginLabel })),
      {
        types: { page: m.node_type_page(), document: m.node_type_document(), collection: m.node_type_collection() },
        kind: (type, source) => m.collection_member_kind({ type, source }),
      }
    )
  );
  const footer = $derived(members.length === 1 ? m.collection_members_count_one({ count: 1 }) : m.collection_members_count_other({ count: members.length }));
</script>

<EntryList
  status="ready"
  mode="page"
  density="normal"
  class="cap-surface"
  placeholder={null}
  columns={{ name: m.collection_column_name(), kind: m.collection_column_kind() }}
  loading={false}
  {rows}
  {empty}
  {footer}
  more={null}
/>
