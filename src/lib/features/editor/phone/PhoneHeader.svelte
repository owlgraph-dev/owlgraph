<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A separate header from desktop's, not a shared one (docs/architecture/editor.md).
  // The panels' open state stays local: this shell has no Escape-key
  // coordination across overlays that would need to read it.
  import { untrack } from 'svelte';
  import { Button, FieldError } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import InlineEditField from '../meta/InlineEditField.svelte';
  import PhoneTagsSheet from './PhoneTagsSheet.svelte';
  import { AccessControlPanel } from '$lib/features/nodes/components';
  import { PagePropertiesDialog } from '$lib/features/semantic/components';
  import * as m from '$lib/paraglide/messages';
  import type { NodeClassOption, ClassFieldGroup } from '$lib/features/semantic';

  let {
    title = '',
    onRename,
    tags = [],
    onSetTags,
    tagSuggestions = [],
    nodeClassId = null,
    nodeClasses = [],
    onSetNodeClass,
    locale,
    onSetLocale,
    pageProperties = [],
    manualProperties = [],
    onSetManualProperties,
    propSuggestions = [],
    propertyGroups = [],
    classDefinitions = [],
    classGroups = [],
    visibility,
    namespaceAccessLevel,
    namespaceMembers = [],
    shares = [],
    users = [],
    onSetVisibility,
    onSetShares,
    shareLinks = [],
    onCreateShareLink,
    onRevokeShareLink,
    namespaceId,
    namespaces = [],
    onSetNamespace,
  }: {
    title?: string;
    onRename?: (changes: { title?: string; slug?: string }) => Promise<{ ok: boolean; title?: string; slug?: string; error?: string }>;
    tags?: string[];
    onSetTags?: (tags: string[]) => void;
    tagSuggestions?: string[];
    nodeClassId?: string | null;
    nodeClasses?: NodeClassOption[];
    onSetNodeClass?: (id: string | null) => Promise<{ ok: boolean; error?: string } | undefined>;
    locale?: string;
    onSetLocale?: (locale: string) => Promise<{ ok: boolean; error?: string }>;
    pageProperties?: { name: string; value: string }[];
    manualProperties?: { name: string; value: string }[];
    onSetManualProperties?: (props: { name: string; value: string }[]) => void;
    propSuggestions?: { name: string; label: string; datatype: string }[];
    propertyGroups?: { slug: string; label: string; description: string }[];
    classDefinitions?: { name: string; label: string; datatype: string }[];
    classGroups?: ClassFieldGroup[];
    visibility: string | null;
    namespaceAccessLevel: string;
    namespaceMembers?: { id: string; name: string; email: string }[];
    shares?: string[];
    users?: { id: string; name: string; email: string }[];
    onSetVisibility?: (visibility: string | null) => Promise<{ ok: boolean; visibility?: string | null } | undefined>;
    onSetShares?: (shares: string[]) => Promise<{ ok: boolean; shares?: string[] } | undefined>;
    shareLinks?: { id: string; label: string; createdAt: string }[];
    onCreateShareLink?: (label: string) => Promise<{ ok: boolean; id?: string; token?: string; label?: string; createdAt?: string; error?: string }>;
    onRevokeShareLink?: (id: string) => Promise<{ ok: boolean }>;
    namespaceId?: string;
    namespaces?: { id: string; name: string; slug: string | null; isDefault: boolean }[];
    onSetNamespace?: (namespaceId: string) => Promise<{ ok: boolean; error?: string } | undefined>;
  } = $props();

  let titleVal = $state(untrack(() => title));
  let metaError = $state<string | null>(null);
  const uid = $props.id();
  const metaErrorId = `${uid}-meta-error`;
  async function commitTitleValue(next: string): Promise<{ ok: boolean; error?: string } | undefined> {
    const res = await onRename?.({ title: next });
    if (res?.ok) { titleVal = res.title ?? next; return { ok: true }; }
    return { ok: false, error: res?.error ?? m.editor_header_title_error() };
  }

  let tagsOpen = $state(false);
  let propertiesOpen = $state(false);
  let accessOpen = $state(false);
</script>

<div class="m-head-row">
  <div class="m-titlewrap">
    <InlineEditField
      variant="title"
      value={titleVal}
      placeholder={m.editor_header_title_placeholder()}
      ariaLabel={m.editor_header_title_aria()}
      editTitle={m.editor_header_title_edit_title()}
      disabled={!onRename}
      errorId={metaErrorId}
      onCommit={commitTitleValue}
      onError={(msg: string | null) => (metaError = msg)}
    />
  </div>
  <Button variant="ghost" size="sm" icon title={m.editor_tags_trigger_title()} aria-label={m.editor_tags_trigger_title()} onclick={() => (tagsOpen = true)}><Icon name="tag" /></Button>
  <Button variant="ghost" size="sm" icon title={m.editor_properties_trigger_title()} aria-label={m.editor_properties_trigger_title()} onclick={() => (propertiesOpen = true)}><Icon name="braces" /></Button>
  <Button variant="ghost" size="sm" icon title={m.editor_header_access_control()} aria-label={m.editor_header_access_control()} onclick={() => (accessOpen = true)}><Icon name="lock" /></Button>
</div>
{#if metaError}<div class="m-meta-error"><FieldError id={metaErrorId} message={metaError} /></div>{/if}

<PhoneTagsSheet bind:open={tagsOpen} {tags} {onSetTags} {tagSuggestions} />

<AccessControlPanel
  open={accessOpen}
  {visibility}
  {namespaceAccessLevel}
  {namespaceMembers}
  {shares}
  {users}
  {onSetVisibility}
  {onSetShares}
  {shareLinks}
  {onCreateShareLink}
  {onRevokeShareLink}
  {namespaceId}
  {namespaces}
  {onSetNamespace}
  onClose={() => (accessOpen = false)}
/>

<PagePropertiesDialog bind:open={propertiesOpen} {pageProperties} {manualProperties} {onSetManualProperties} {propSuggestions} {propertyGroups} {nodeClassId} {nodeClasses} {onSetNodeClass} {locale} {onSetLocale} {classDefinitions} {classGroups} />

<style>
  .m-head-row {
    height: var(--appbar-top-h, 3.25rem);
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0 0.75rem;
    border-bottom: 1px solid var(--ds-color-border);
  }
  .m-titlewrap { flex: 1; min-width: 0; }
  .m-titlewrap > :global(.field-view-title),
  .m-titlewrap > :global(.field-edit-title) { width: 100%; }
  .m-meta-error { padding: 0.3rem 0.75rem; border-bottom: 1px solid var(--ds-color-border); }
</style>
