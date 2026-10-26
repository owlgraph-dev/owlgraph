<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Each host draws its own heading and buttons: a submit button names this
  // form (`form={id}`). Where to go after `onCreated` is the host's decision.
  import { untrack } from 'svelte';
  import { uploadDocument, createLinkDocument } from '../client';
  import { parseExternalUrl, type DocumentSource } from '../externalUrl';
  import { externalUrlMessage } from '../components/externalUrlMessage';
  import { Input, Alert, FormField, RadioGroup } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';

  let {
    id,
    namespaceId,
    initialTitle = '',
    busy = $bindable(false),
    source = $bindable('upload'),
    onCreated,
  }: {
    /** The form element's id, for a submit button outside it. */
    id: string;
    /** Where the document is made; null for the default namespace. */
    namespaceId: string | null;
    /** The title the form opens with (what a picker was searching for). */
    initialTitle?: string;
    busy?: boolean;
    /** A host labels its submit by it ("Upload" / "Create"). */
    source?: DocumentSource;
    onCreated: (doc: { id: string; slug: string; title: string }) => void;
  } = $props();

  let file = $state<File | null>(null);
  let url = $state('');
  let title = $state(untrack(() => initialTitle));
  let error = $state<string | null>(null);
  let urlError = $state<string | null>(null);
  let titleError = $state<string | null>(null);

  function onFileChange(e: Event) {
    file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
  }

  async function submit() {
    if (busy) return;
    if (source === 'link') await link();
    else await upload();
  }

  async function link() {
    const parsed = parseExternalUrl(url);
    urlError = parsed.ok ? null : externalUrlMessage(parsed.reason);
    titleError = title.trim() === '' ? m.create_modal_error_title_required() : null;
    if (!parsed.ok || titleError) return;
    busy = true;
    error = null;
    try {
      const res = await createLinkDocument(parsed.url, title, namespaceId);
      if (!res.ok) {
        error = res.error ?? m.create_modal_error_generic_link();
        return;
      }
      onCreated({ id: res.id, slug: res.slug, title: title.trim() });
    } catch {
      error = m.create_modal_error_generic_link();
    } finally {
      busy = false;
    }
  }

  async function upload() {
    if (!file) {
      error = m.create_modal_error_choose_file();
      return;
    }
    busy = true;
    error = null;
    try {
      const res = await uploadDocument(file, title, namespaceId);
      if (!res.ok) {
        error = res.error ?? m.create_modal_error_generic_upload();
        return;
      }
      // The server names an untitled upload after its file.
      onCreated({ id: res.id, slug: res.slug, title: title.trim() || file.name });
    } catch {
      error = m.create_modal_error_generic_upload();
    } finally {
      busy = false;
    }
  }
</script>

<form
  {id}
  class="new-document"
  onsubmit={(e) => {
    e.preventDefault();
    void submit();
  }}
>
  <div class="wide">
    <FormField label={m.create_modal_source_label()} group>
      <RadioGroup
        size="sm"
        items={[
          { value: 'upload', label: m.document_source_upload() },
          { value: 'link', label: m.document_source_link() },
        ]}
        value={source}
        onValueChange={(v) => {
          source = v as DocumentSource;
          error = null;
        }}
      />
    </FormField>
  </div>
  {#if source === 'upload'}
    <div class="wide">
      <FormField label={m.create_modal_file_label()}>
        {#snippet children(field)}
          <input
            id={field.controlId}
            type="file"
            class="ds-file-input"
            accept="application/pdf,text/plain,text/markdown,.pdf,.txt,.md"
            onchange={onFileChange}
          />
        {/snippet}
      </FormField>
    </div>
    <div class="wide">
      <FormField label={m.create_modal_title_field()} optionalLabel={m.form_field_optional()}><Input bind:value={title} placeholder={m.create_modal_title_placeholder()} /></FormField>
    </div>
  {:else}
    <div class="wide">
      <FormField label={m.create_modal_link_url_label()} error={urlError}>
        <Input type="url" bind:value={url} placeholder={m.document_link_url_placeholder()} />
      </FormField>
    </div>
    <div class="wide">
      <FormField label={m.create_modal_title_field()} error={titleError}>
        <Input bind:value={title} placeholder={m.create_modal_link_title_placeholder()} />
      </FormField>
    </div>
  {/if}
  {#if error}<div class="wide"><Alert tone="danger">{error}</Alert></div>{/if}
</form>

<style>
  .new-document {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.7rem;
  }
  .wide {
    grid-column: 1 / -1;
  }
  /* Not Input.svelte: bind:value can't work on type="file", whose value is
     read-only (docs/architecture/design-system/primitives.md, "What is not a primitive"). */
  .ds-file-input {
    box-sizing: border-box;
    width: 100%;
    height: var(--ds-control-h-md);
    padding: 0.35rem 0.6rem;
    font: inherit;
    font-family: var(--ds-font-sans);
    font-size: var(--ds-text-md);
    color: var(--ds-color-fg);
    background: var(--ds-color-bg);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-sm);
  }
  .ds-file-input:hover { border-color: var(--ds-color-border-hover); }
</style>
