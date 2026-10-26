// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { graphql } from 'graphql';
import { schema } from '$lib/features/query/server';
import { setManualProperties, setNodeTags } from '$lib/features/semantic/server';
import { userOf } from '$tests/integration/users';
import { createLinkDocument, refreshDocumentSearchMeta } from './server';

describe('a link document', () => {
  it('is found by its tag and by a documents:author value, as type document', async () => {
    const editor = await userOf('editorA');
    const created = await createLinkDocument({ url: 'https://example.org/searchable', title: 'Searchable link doc', createdBy: editor.id, user: editor });
    await setNodeTags(created.id, ['linktag']);
    await setManualProperties(created.id, [{ name: 'documents:author', value: 'Quillfeather' }]);
    await refreshDocumentSearchMeta(created.id);

    const search = async (text: string) => {
      const res = await graphql({ schema, source: 'query($t: String!) { search(text: $t) { id type } }', variableValues: { t: text }, contextValue: { user: editor } });
      expect(res.errors).toBeUndefined();
      return (res.data as { search: { id: string; type: string }[] }).search;
    };
    expect(await search('linktag')).toContainEqual({ id: created.id, type: 'document' });
    expect(await search('Quillfeather')).toContainEqual({ id: created.id, type: 'document' });
  });
});
