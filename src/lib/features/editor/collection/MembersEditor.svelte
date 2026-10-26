<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A curated collection's members (docs/architecture/semantic-layer.md, "Collections").
  // Every change goes to the server at once and the list shows its answer:
  // the members this editor may read. A refused change (a stale order, a loop
  // of collections) leaves the list as the server has it, and says why.
  import { untrack } from 'svelte';
  import { Badge, Button, DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, EmptyState, SortableList, TriggerFace, toast } from '$lib/design-system';
  import Icon from '$lib/design-system/Icon.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    addCollectionMember,
    loadCollectionMembers,
    removeCollectionMember,
    reorderCollectionMembers,
    setCollectionMemberLabel,
    type CollectionMember,
    type MembersResult,
  } from '$lib/features/collections';
  import type { NodeSearchResult } from '$lib/features/search';
  import type { LocalizedText } from '$lib/platform/i18n/localizedText';
  import { NodePicker } from '$lib/features/search/picker';
  import { NODE_TYPE_LABEL, NODE_TYPES } from '$lib/features/nodes';
  import MemberLabelDialog from './MemberLabelDialog.svelte';

  let {
    collectionId,
    members: initialMembers,
    basis: initialBasis,
    namespace,
  }: {
    collectionId: string;
    members: CollectionMember[];
    basis: string;
    /** The collection's namespace, where a member made from the picker goes; null offers no making. */
    namespace: { id: string; name: string; slug: string | null } | null;
  } = $props();

  let members = $state<CollectionMember[]>(untrack(() => initialMembers));
  let basis = $state(untrack(() => initialBasis));
  let busy = $state(false);
  let pickerOpen = $state(false);
  let labelling = $state<CollectionMember | null>(null);
  let labelBusy = $state(false);

  const memberIds = $derived(new Set(members.map((member) => member.id)));
  // The collection is never offered to itself.
  const itself = $derived(new Set([collectionId]));
  const kindOf = (member: CollectionMember) =>
    member.pluginLabel ? m.collection_member_kind({ type: NODE_TYPE_LABEL[member.type](), source: member.pluginLabel }) : NODE_TYPE_LABEL[member.type]();
  const footer = $derived(members.length === 1 ? m.collection_members_count_one({ count: 1 }) : m.collection_members_count_other({ count: members.length }));

  function show(result: Extract<MembersResult, { ok: true }>) {
    members = result.members;
    basis = result.basis;
  }

  function refusal(code: string, title: string): string {
    if (code === 'cycle') return m.collection_members_cycle({ title });
    if (code === 'self_member') return m.collection_members_self();
    if (code === 'too_deep') return m.collection_members_too_deep();
    if (code === 'stale_order') return m.collection_members_stale();
    return m.collection_members_failed();
  }

  async function reload() {
    const result = await loadCollectionMembers(collectionId);
    if (result.ok) show(result);
  }

  // The order still to be sent, while one is on its way: moves made meanwhile
  // are shown at once and sent together after it, never dropped.
  let wanted: { order: string[]; title: string } | null = null;
  let sending = false;

  async function move(from: number, to: number) {
    if (busy || to < 0 || to >= members.length) return;
    const next = [...members];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    members = next;
    wanted = { order: next.map((member) => member.id), title: moved.title };
    if (sending) return;
    sending = true;
    while (wanted) {
      const { order, title } = wanted;
      wanted = null;
      const result = await reorderCollectionMembers(collectionId, order, basis);
      if (result.ok) {
        // A later move waits its turn: its order is shown, and sent against this answer's basis.
        if (wanted) basis = result.basis;
        else show(result);
        continue;
      }
      wanted = null;
      toast.error(refusal(result.code, title));
      await reload();
    }
    sending = false;
  }

  async function add(node: NodeSearchResult) {
    if (memberIds.has(node.id)) {
      toast.info(m.collection_members_already({ title: node.title }));
      return;
    }
    busy = true;
    const result = await addCollectionMember(collectionId, node.id);
    busy = false;
    if (!result.ok) {
      toast.error(refusal(result.code, node.title));
      return;
    }
    show(result);
    if (result.existed) toast.info(m.collection_members_already({ title: node.title }));
  }

  async function remove(member: CollectionMember) {
    busy = true;
    const result = await removeCollectionMember(collectionId, member.id);
    busy = false;
    if (result.ok) show(result);
    else toast.error(refusal(result.code, member.title));
  }

  async function saveLabel(label: LocalizedText | null) {
    const member = labelling;
    if (!member) return;
    labelBusy = true;
    const result = await setCollectionMemberLabel(collectionId, member.id, label);
    labelBusy = false;
    if (!result.ok) {
      toast.error(refusal(result.code, member.title));
      return;
    }
    show(result);
    labelling = null;
  }
</script>

<section class="members" aria-labelledby="members-heading-{collectionId}">
  <div class="head">
    <h2 id="members-heading-{collectionId}">{m.collection_members_heading()}</h2>
    <Button size="sm" variant="secondary" onclick={() => (pickerOpen = true)}><Icon name="plus" size={16} />{m.collection_members_add()}</Button>
  </div>

  {#if members.length === 0}
    <EmptyState size="sm">{m.collection_members_empty()}</EmptyState>
  {:else}
    <SortableList
      items={members}
      key={(member) => member.id}
      onMove={move}
      handleLabel={(member) => m.collection_member_move({ title: member.title })}
      instructions={m.collection_members_move_instructions()}
      announce={(member, position, count) => m.collection_member_moved({ title: member.title, position, count })}
      ariaLabel={m.collection_members_heading()}
    >
      {#snippet item(member, { handle, index })}
        <div class="row">
          {@render handle()}
          <div class="what">
            <span class="title">{member.title}</span>
            {#if member.label}<span class="label">{m.collection_member_label_shown({ label: member.label })}</span>{/if}
          </div>
          <span class="kind"><Badge tone={member.type === 'document' ? 'info' : 'accent'}>{kindOf(member)}</Badge></span>
          <DropdownMenu ariaLabel={m.collection_member_actions({ title: member.title })} triggerProps={{ 'aria-label': m.collection_member_actions({ title: member.title }), title: m.collection_member_actions({ title: member.title }) }}>
            {#snippet trigger()}<TriggerFace variant="ghost" size="sm" icon><Icon name="more" size={16} /></TriggerFace>{/snippet}
            <DropdownMenuItem href={member.url} target="_blank" rel="noopener">{m.collection_member_open()}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => (labelling = member)}>{m.collection_member_label_action()}</DropdownMenuItem>
            <DropdownMenuItem disabled={index === 0} onSelect={() => void move(index, index - 1)}>{m.collection_member_move_up()}</DropdownMenuItem>
            <DropdownMenuItem disabled={index === members.length - 1} onSelect={() => void move(index, index + 1)}>{m.collection_member_move_down()}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="danger" onSelect={() => void remove(member)}>{m.collection_member_remove()}</DropdownMenuItem>
          </DropdownMenu>
        </div>
      {/snippet}
    </SortableList>
    <p class="foot">{footer} · {m.collection_members_drag_hint()}</p>
  {/if}
</section>

<NodePicker
  open={pickerOpen}
  onOpenChange={(v) => (pickerOpen = v)}
  title={m.collection_picker_title()}
  placeholder={m.collection_picker_placeholder()}
  types={NODE_TYPES}
  exclude={itself}
  mark={(node) => (memberIds.has(node.id) ? { note: m.collection_picker_already() } : null)}
  rowAction={m.collection_picker_add()}
  create={namespace ? { types: ['page', 'collection', 'document'], namespace } : undefined}
  onPick={(node) => void add(node)}
/>

{#if labelling}
  <MemberLabelDialog
    open={true}
    onOpenChange={(v) => {
      if (!v) labelling = null;
    }}
    title={labelling.title}
    label={labelling.labelText}
    busy={labelBusy}
    onSave={(label) => void saveLabel(label)}
  />
{/if}

<style>
  .members { container-type: inline-size; }
  .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ds-space-sm); margin-bottom: var(--ds-space-sm); }
  h2 { margin: 0; font-size: var(--ds-text-md); }
  .row {
    display: flex;
    align-items: center;
    gap: var(--ds-space-sm);
    padding: calc(var(--ds-space-sm) / 2) 0;
    border-bottom: 1px solid var(--ds-color-border);
    min-width: 0;
  }
  .what { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
  .title { overflow-wrap: anywhere; color: var(--ds-color-fg); }
  .label { font-size: var(--ds-text-sm); color: var(--ds-color-muted); overflow-wrap: anywhere; }
  .kind { flex: none; }
  .foot { margin: var(--ds-space-sm) 0 0; font-size: var(--ds-text-sm); color: var(--ds-color-muted); }
  /* On a phone the title takes the kind's room. */
  @container (max-width: 30rem) {
    .kind { display: none; }
  }
</style>
