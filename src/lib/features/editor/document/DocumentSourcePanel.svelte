<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Switching the source is confirmed: to a link deletes the stored file, to
  // an upload removes the URL (docs/architecture/documents.md). Within a source, replacing
  // needs no confirm. A document from an integration offers no switch.
  import { untrack } from 'svelte';
  import { Button, FormField, Input, RadioGroup } from '$lib/design-system';
  import { parseExternalUrl, externalHost, formatFileSize, documentContentPath, type DocumentSource } from '$lib/features/documents';
  import { OpenExternalButton, externalUrlMessage } from '$lib/features/documents/components';
  import SwitchDocumentSourceModal from './SwitchDocumentSourceModal.svelte';
  import { pluginLabel } from '$lib/plugins';
  import * as m from '$lib/paraglide/messages';

  type FileResult = { ok: boolean; filename?: string; mime?: string; size?: number; error?: string };
  type LinkResult = { ok: true; externalUrl: string } | { ok: false; error: string };

  let {
    documentId,
    source,
    plugin = null,
    externalUrl,
    filename,
    mime,
    size,
    onReplace,
    onSetLink,
  }: {
    documentId: string;
    source: DocumentSource;
    plugin?: string | null;
    externalUrl: string | null;
    filename: string;
    mime: string | null;
    size: number | null;
    onReplace?: (file: File) => Promise<FileResult>;
    onSetLink?: (url: string) => Promise<LinkResult>;
  } = $props();

  // Seeded from the stored source; a successful switch moves both.
  let selected = $state<DocumentSource>(untrack(() => source));
  const switching = $derived(selected !== source);

  let fileInput = $state<HTMLInputElement | null>(null);
  let pendingFile = $state<File | null>(null);
  let fileBusy = $state(false);
  let fileError = $state<string | null>(null);

  let urlDraft = $state(untrack(() => externalUrl ?? ''));
  let urlBusy = $state(false);
  let urlError = $state<string | null>(null);

  let confirmOpen = $state(false);
  let confirmBusy = $state(false);
  let confirmError = $state<string | null>(null);

  function choose(value: string) {
    selected = value as DocumentSource;
    fileError = null;
    urlError = null;
  }

  function onFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    pendingFile = input.files?.[0] ?? null;
    fileError = null;
  }

  function resetFileInput() {
    pendingFile = null;
    if (fileInput) fileInput.value = '';
  }

  // null with the field error set.
  function validUrl(): string | null {
    const parsed = parseExternalUrl(urlDraft);
    if (!parsed.ok) {
      urlError = externalUrlMessage(parsed.reason);
      return null;
    }
    urlError = null;
    return parsed.url;
  }

  async function replace() {
    if (!pendingFile || !onReplace) return;
    fileBusy = true;
    fileError = null;
    const res = await onReplace(pendingFile);
    fileBusy = false;
    if (!res.ok) {
      fileError = res.error ?? m.document_file_replace_error();
      return;
    }
    resetFileInput();
  }

  async function saveLink() {
    const url = validUrl();
    if (!url || !onSetLink) return;
    urlBusy = true;
    const res = await onSetLink(url);
    urlBusy = false;
    if (!res.ok) {
      urlError = res.error || m.document_link_save_error();
      return;
    }
    urlDraft = res.externalUrl;
  }

  // Validated before the confirm, so a field error stays next to its field.
  function requestSwitch() {
    if (selected === 'link') {
      if (!validUrl()) return;
    } else if (!pendingFile) {
      fileError = m.document_switch_error_choose_file();
      return;
    }
    confirmError = null;
    confirmOpen = true;
  }

  async function confirmSwitch() {
    confirmBusy = true;
    confirmError = null;
    if (selected === 'link') {
      const url = validUrl();
      const res = url && onSetLink ? await onSetLink(url) : null;
      confirmBusy = false;
      if (!res || !res.ok) {
        confirmError = res && !res.ok ? res.error : m.document_link_save_error();
        return;
      }
      urlDraft = res.externalUrl;
    } else {
      const res = pendingFile && onReplace ? await onReplace(pendingFile) : null;
      confirmBusy = false;
      if (!res || !res.ok) {
        confirmError = res?.error ?? m.document_file_replace_error();
        return;
      }
      resetFileInput();
    }
    confirmOpen = false;
  }
</script>

{#if source === 'plugin'}
<section class="source-panel">
  <h2>{m.document_source_heading()}</h2>
  <div class="source-body">
    <dl class="meta">
      <dt>{m.document_source_plugin_label()}</dt>
      <dd>{pluginLabel(plugin ?? '')}</dd>
      <dt>{m.document_file_label()}</dt>
      <dd>{filename} · {mime} · {formatFileSize(size ?? 0)}</dd>
    </dl>
    <p class="hint">{m.document_source_plugin_hint()}</p>
    <div class="actions">
      <Button href={documentContentPath(documentId)} target="_blank" rel="noopener">{m.document_view()}</Button>
      <Button href={documentContentPath(documentId, { download: true })} download={filename} variant="secondary">{m.document_download()}</Button>
    </div>
  </div>
</section>
{:else}
<section class="source-panel">
  <h2>{m.document_source_heading()}</h2>
  <RadioGroup
    size="sm"
    ariaLabel={m.document_source_heading()}
    items={[
      { value: 'upload', label: m.document_source_upload() },
      { value: 'link', label: m.document_source_link() },
    ]}
    value={selected}
    onValueChange={choose}
  />

  <div class="source-body">
    {#if selected === 'upload' && !switching}
      <dl class="meta">
        <dt>{m.document_file_label()}</dt>
        <dd>{filename} · {mime} · {formatFileSize(size ?? 0)}</dd>
      </dl>
      <div class="actions">
        <Button href={documentContentPath(documentId)} target="_blank" rel="noopener">{m.document_view()}</Button>
        <Button href={documentContentPath(documentId, { download: true })} download={filename} variant="secondary">{m.document_download()}</Button>
      </div>
    {:else if selected === 'link' && !switching}
      <dl class="meta">
        <dt>{m.document_external_label()}</dt>
        <dd>{externalHost(externalUrl ?? '')}</dd>
      </dl>
      <div class="actions">
        <OpenExternalButton href={documentContentPath(documentId)} {externalUrl} variant="secondary" />
      </div>
    {/if}

    <div class="edit">
      {#if selected === 'upload'}
        <FormField label={switching ? m.document_switch_file_label() : m.document_file_replace_heading()} error={fileError}>
          {#snippet children(field)}
            <div class="edit-row">
              <input
                bind:this={fileInput}
                id={field.controlId}
                aria-describedby={field.describedBy}
                aria-invalid={field.invalid ? 'true' : undefined}
                type="file"
                class="ds-file-input"
                accept="application/pdf,text/plain,text/markdown,.pdf,.txt,.md"
                onchange={onFileChange}
              />
              {#if switching}
                <Button variant="primary" onclick={requestSwitch}>{m.document_switch_to_upload_button()}</Button>
              {:else}
                <Button variant="secondary" onclick={replace} disabled={!pendingFile} loading={fileBusy}>{m.document_file_replace_button()}</Button>
              {/if}
            </div>
          {/snippet}
        </FormField>
      {:else}
        <FormField label={m.document_link_url_label()} error={urlError}>
          {#snippet children()}
            <div class="edit-row">
              <div class="grow"><Input type="url" bind:value={urlDraft} placeholder={m.document_link_url_placeholder()} /></div>
              {#if switching}
                <Button variant="danger" onclick={requestSwitch}>{m.document_switch_to_link_button()}</Button>
              {:else}
                <Button variant="secondary" onclick={saveLink} disabled={urlDraft.trim() === '' || urlDraft === externalUrl} loading={urlBusy}>{m.document_link_save()}</Button>
              {/if}
            </div>
          {/snippet}
        </FormField>
      {/if}
    </div>
  </div>
</section>

<SwitchDocumentSourceModal
  open={confirmOpen}
  target={selected}
  busy={confirmBusy}
  error={confirmError}
  onConfirm={confirmSwitch}
  onOpenChange={(v) => (confirmOpen = v)}
/>
{/if}

<style>
  .source-panel { margin: 0 0 1.5rem; }
  h2 { margin: 0 0 0.6rem; font-size: 0.95rem; }
  .source-body { margin-top: 0.8rem; }
  .meta { display: grid; grid-template-columns: max-content 1fr; gap: 0.2rem 0.8rem; margin: 0 0 0.8rem; font-size: 0.9rem; }
  .meta dt { color: var(--ds-color-muted); }
  .meta dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
  .actions { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
  .hint { margin: 0 0 0.8rem; color: var(--ds-color-muted); font-size: var(--ds-text-sm); }
  .edit { border-top: 1px solid var(--ds-color-border); padding-top: 0.8rem; }
  .edit-row { display: flex; align-items: center; gap: 0.5rem; }
  .grow { flex: 1; min-width: 0; }
</style>
