<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A collection's contents on its own page (docs/architecture/plugins.md, "Node views"):
  // the folder block's component, server-rendered from what the plugin held
  // (nodeView.server.ts), its footer saying how this viewer reads it.
  import type { PluginNodeBodyProps } from '$lib/plugins/api';
  import FolderListing from '../blocks/folder/FolderListing.svelte';
  import { editingFor } from '../blocks/folder/editing';
  import { folderTexts } from '../blocks/folder/texts';
  import { folderProps, type FolderEditing } from '../blocks/folder/view';
  import { t } from '../messages';
  import type { CollectionBodyData } from '../server/nodeView.server';

  let { node, canWrite, data, locale, onChange }: PluginNodeBodyProps = $props();

  const body = $derived(data as CollectionBodyData);

  // Tells the core once a document was made, so it reloads the linked documents.
  const editing = $derived.by((): FolderEditing | null => {
    const write = canWrite ? editingFor(node.id) : null;
    if (!write) return null;
    return {
      async createDocument(path, fileid) {
        const made = await write.createDocument(path, fileid);
        if (made) onChange();
        return made;
      },
    };
  });

  const listing = $derived({
    ...folderProps(
      { collectionId: node.id },
      { mode: 'page', initial: body.view, texts: folderTexts(canWrite), locale, renderedAt: body.renderedAt, ruleId: '', base: body.base, editing }
    ),
    provenance: { user: body.readAs ? t('node_read_as', { name: body.readAs }) : '', node: t('node_via_share') },
  });
</script>

<FolderListing {...listing} />
