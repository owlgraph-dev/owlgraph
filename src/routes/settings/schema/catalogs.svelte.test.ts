// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent, type Locator } from '@vitest/browser/context';
import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
import ClassesPage from './classes/+page.svelte';
import PropertiesPage from './properties/+page.svelte';
import GroupsPage from './groups/+page.svelte';
import RelationshipsPage from './relationships/+page.svelte';
import type { PageData as ClassesData } from './classes/$types';
import type { PageData as PropertiesData } from './properties/$types';
import type { PageData as GroupsData } from './groups/$types';
import type { PageData as RelationshipsData } from './relationships/$types';

// Each page renders with its load's data; SvelteKit's `update` is played back
// by rendering it with what the route would hand it next.

type Post = { action: string | null; formData: FormData };

// `$app/forms`' enhance: the submit is caught before it leaves the page and
// run through the page's submit function with the test's answer.
const forms = vi.hoisted(() => ({
  posts: [] as Post[],
  answer: (_post: Post): ActionResult => ({ type: 'success', status: 200 }),
  applied: async (_result: ActionResult): Promise<void> => {},
}));

vi.mock('$app/forms', () => ({
  enhance(form: HTMLFormElement, submit?: SubmitFunction) {
    async function onsubmit(event: SubmitEvent) {
      event.preventDefault();
      const formData = new FormData(form, event.submitter);
      const action = new URL(form.action);
      let cancelled = false;
      const after = await submit?.({ action, formData, formElement: form, controller: new AbortController(), submitter: event.submitter, cancel: () => (cancelled = true) });
      if (cancelled) return;
      const post = { action: form.getAttribute('action'), formData };
      forms.posts.push(post);
      const result = forms.answer(post);
      const update = async () => forms.applied(result);
      if (typeof after === 'function') await after({ action, formData, formElement: form, result, update });
      else await update();
    }
    form.addEventListener('submit', onsubmit);
    return { destroy: () => form.removeEventListener('submit', onsubmit) };
  },
  applyAction: async () => {},
  deserialize: (text: string) => JSON.parse(text),
}));

beforeEach(() => {
  forms.posts = [];
  forms.answer = () => ({ type: 'success', status: 200 });
  forms.applied = async () => {};
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const dialog = () => screen.getByRole('dialog');
const rowOf = (text: string) => screen.getByRole('row').filter({ hasText: text });
const lastPost = () => forms.posts.at(-1)!;

async function pick(trigger: Locator, option: RegExp) {
  await trigger.click();
  await screen.getByRole('option', { name: option }).click();
}

const CORE = { slug: 'core', label: { en: 'Core', de: 'Kern' }, description: {} };
const DOCUMENTS = { slug: 'documents', label: { en: 'Documents', de: 'Dokumente' }, description: {} };

describe('the class catalog', () => {
  type Row = ClassesData['classes'][number];
  const base = { description: {}, property_group: null, overview_node_id: null, node_count: 0, overview_title: null, overview_path: null } as const;
  const ROOT: Row = { ...base, id: 'c-root', slug: 'node', label: { en: 'Node', de: 'Knoten' }, kind: 'root', parent_id: null, node_type: null, parent_slug: null, depth: 0 };
  const PAGE: Row = { ...base, id: 'c-page', slug: 'page', label: { en: 'Page', de: 'Seite' }, kind: 'type', parent_id: 'c-root', node_type: 'page', parent_slug: 'node', depth: 1, node_count: 4 };
  const DOCUMENT: Row = { ...base, id: 'c-document', slug: 'document', label: { en: 'Document', de: 'Dokument' }, property_group: 'documents', kind: 'type', parent_id: 'c-root', node_type: 'document', parent_slug: 'node', depth: 1 };
  const WORK_PACKAGE: Row = { ...base, id: 'c-work-package', slug: 'work-package', label: { en: 'Work package' }, property_group: 'core', kind: 'domain', parent_id: 'c-page', node_type: 'page', parent_slug: 'page', depth: 2 };
  const data = (classes: Row[]) => ({ classes, groups: [CORE, DOCUMENTS] }) as unknown as ClassesData;

  it('posts a new class’s key, English label, parent and property group to the save action, and its row’s Delete posts its id', async () => {
    const view = render(ClassesPage, { data: data([ROOT, PAGE, DOCUMENT]), form: null });
    // The save reloads the catalogue: the class is listed under its parent.
    forms.applied = (result) => view.rerender({ data: data([ROOT, PAGE, WORK_PACKAGE, DOCUMENT]), form: result.type === 'success' ? { saved: true } : null });

    await screen.getByRole('button', { name: 'Add class' }).click();
    await expect.element(dialog()).toBeVisible();
    await dialog().getByLabelText('Key', { exact: true }).fill('work-package');
    await dialog().getByRole('textbox', { name: 'Label English', exact: true }).fill('Work package');
    await pick(dialog().getByRole('combobox', { name: 'Parent' }), /\(page\)$/);
    await pick(dialog().getByRole('combobox', { name: 'Property group (optional)' }), /\(core\)$/);
    await dialog().getByRole('button', { name: 'Save' }).click();

    await vi.waitFor(() => expect(forms.posts).toHaveLength(1));
    const save = lastPost();
    expect(save.action).toBe('?/save');
    expect(save.formData.get('id')).toBe('');
    expect(save.formData.get('slug')).toBe('work-package');
    expect(save.formData.get('label.en')).toBe('Work package');
    expect(save.formData.get('parentId')).toBe(PAGE.id);
    expect(save.formData.get('propertyGroup')).toBe('core');
    await expect.element(dialog()).not.toBeInTheDocument();

    const row = rowOf('work-package');
    await expect.element(row).toHaveTextContent('Work package');
    await expect.element(row).toHaveTextContent('core');
    const remove = row.getByRole('button', { name: 'Delete' });
    await expect.element(remove).toBeEnabled();
    await remove.click();
    await vi.waitFor(() => expect(forms.posts).toHaveLength(2));
    expect(lastPost().action).toBe('?/delete');
    expect(lastPost().formData.get('id')).toBe(WORK_PACKAGE.id);
  });
});

describe('the properties catalog', () => {
  type Row = PropertiesData['definitions'][number];
  const STATUS: Row = { name: 'core:status', group_slug: 'core', label: { en: 'Status', de: 'Status' }, datatype: 'text', description: {} };

  it('keeps the modal open on a rejected save and shows the server’s error inside it', async () => {
    const view = render(PropertiesPage, { data: { definitions: [STATUS], groups: [CORE, DOCUMENTS] } as unknown as PropertiesData, form: null });
    const refusal = 'Invalid property name: not a valid name';
    forms.answer = () => ({ type: 'failure', status: 400, data: { error: { code: 'invalid_key', message: refusal } } });
    forms.applied = (result) => view.rerender({ form: result.type === 'failure' ? (result.data as { error: { code: string; message: string } }) : null });

    await expect.element(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Properties');
    await screen.getByRole('button', { name: 'Add property' }).click();
    await expect.element(dialog().getByRole('heading', { name: 'Add property' })).toBeVisible();
    await dialog().getByLabelText('Name', { exact: true }).fill('not a valid name');
    await dialog().getByRole('textbox', { name: 'Label English', exact: true }).fill('E2E label');
    await dialog().getByRole('button', { name: 'Save' }).click();

    await vi.waitFor(() => expect(forms.posts).toHaveLength(1));
    expect(lastPost().action).toBe('?/save');
    expect(lastPost().formData.get('localName')).toBe('not a valid name');
    expect(lastPost().formData.get('groupSlug')).toBe('core');
    expect(lastPost().formData.get('label.en')).toBe('E2E label');
    await expect.element(dialog()).toBeVisible();
    await expect.element(dialog().getByRole('alert')).toHaveTextContent(refusal);
  });
});

describe('the property groups catalog', () => {
  type Row = GroupsData['groups'][number];
  const data = (groups: Row[]) => ({ groups }) as unknown as GroupsData;
  const mine = (label: Row['label']): Row => ({ slug: 'e2egrp', label, description: {} });

  it('opens the modal empty to add and loaded to edit, the label in place before it is typed over, and posts the key and the label', async () => {
    let groups: Row[] = [CORE, DOCUMENTS];
    const view = render(GroupsPage, { data: data(groups), form: null });
    forms.applied = async (result) => {
      if (result.type !== 'success') return;
      const post = lastPost();
      if (post.action !== '?/save') return;
      const saved = mine({ en: String(post.formData.get('label.en')) });
      groups = [...groups.filter((g) => g.slug !== saved.slug), saved];
      await view.rerender({ data: data(groups), form: { saved: true } });
    };

    await screen.getByRole('button', { name: 'Add group' }).click();
    await expect.element(dialog().getByRole('heading', { name: 'Add group' })).toBeVisible();
    const namespace = dialog().getByLabelText('Key', { exact: true });
    const label = dialog().getByRole('textbox', { name: 'Label English', exact: true });
    await expect.element(namespace).toHaveValue('');
    await expect.element(label).toHaveValue('');
    await namespace.fill('e2egrp');
    await label.fill('E2E group');
    await dialog().getByRole('button', { name: 'Save' }).click();
    await vi.waitFor(() => expect(forms.posts).toHaveLength(1));
    expect(lastPost().action).toBe('?/save');
    expect(lastPost().formData.get('slug')).toBe('e2egrp');
    expect(lastPost().formData.get('label.en')).toBe('E2E group');
    await expect.element(dialog()).not.toBeInTheDocument();

    const row = rowOf('e2egrp');
    await expect.element(row).toHaveTextContent('E2E group');
    await row.getByRole('button', { name: 'Edit' }).click();
    await expect.element(dialog().getByRole('heading', { name: 'Update group' })).toBeVisible();
    await expect.element(dialog().getByLabelText('Key', { exact: true })).toHaveValue('e2egrp');
    const editLabel = dialog().getByRole('textbox', { name: 'Label English', exact: true });
    await expect.element(editLabel).toHaveValue('E2E group');
    await editLabel.fill('E2E group edited');
    await expect.element(editLabel).toHaveValue('E2E group edited');
    await dialog().getByRole('button', { name: 'Save' }).click();
    await vi.waitFor(() => expect(forms.posts).toHaveLength(2));
    expect(lastPost().formData.get('slug')).toBe('e2egrp');
    expect(lastPost().formData.get('label.en')).toBe('E2E group edited');
    await expect.element(dialog()).not.toBeInTheDocument();
    await expect.element(row).toHaveTextContent('E2E group edited');

    await row.getByRole('button', { name: 'Delete' }).click();
    await vi.waitFor(() => expect(forms.posts).toHaveLength(3));
    expect(lastPost().action).toBe('?/delete');
    expect(lastPost().formData.get('slug')).toBe('e2egrp');
  });

  it('marks the row missing a translation, narrows to such rows, matches a label in any language, and drops the mark once translated', async () => {
    let groups: Row[] = [DOCUMENTS, mine({ en: 'Labels English' })];
    const view = render(GroupsPage, { data: data(groups), form: null });
    forms.applied = async (result) => {
      if (result.type !== 'success') return;
      const post = lastPost();
      groups = [DOCUMENTS, mine({ en: String(post.formData.get('label.en')), de: String(post.formData.get('label.de')) })];
      await view.rerender({ data: data(groups), form: { saved: true } });
    };

    const own = rowOf('e2egrp');
    const documents = screen.getByRole('row').filter({ has: screen.getByText('documents', { exact: true }) });
    await expect.element(own).toHaveTextContent('Deutsch missing');
    await expect.element(documents).toHaveTextContent('Documents');
    await expect.element(documents).not.toHaveTextContent('missing');

    // Missing translations only: the fully translated group goes.
    const filter = screen.getByRole('switch', { name: /Missing translations only/ });
    await filter.click();
    await expect.element(own).toBeVisible();
    await expect.element(documents).not.toBeInTheDocument();
    await filter.click();
    await expect.element(documents).toBeVisible();

    // The search matches the German label in the English interface.
    const search = screen.getByRole('searchbox', { name: 'Search the list' });
    await search.fill('Dokumente');
    await expect.element(documents).toBeVisible();
    await expect.element(own).not.toBeInTheDocument();
    await search.fill('');
    await expect.element(own).toBeVisible();

    // The label field, one language at a time.
    await own.getByRole('button', { name: 'Edit' }).click();
    const english = dialog().getByRole('textbox', { name: 'Label English', exact: true });
    const german = dialog().getByRole('textbox', { name: 'Label Deutsch', exact: true });
    await expect.element(english).toHaveValue('Labels English');
    await expect.element(dialog().getByText('1/2 translated')).toBeVisible();
    const language = dialog().getByRole('combobox', { name: 'Label: Language' });
    await language.click();
    await expect.element(screen.getByRole('option', { name: /Deutsch.*missing/ })).toBeVisible();
    await screen.getByRole('option', { name: /Deutsch/ }).click();
    await expect.element(german).toBeVisible();
    await dialog().getByRole('button', { name: 'Copy from English' }).click();
    await expect.element(german).toHaveValue('Labels English');
    await german.fill('Labels Deutsch');
    await pick(language, /English/);
    await expect.element(english).toHaveValue('Labels English');
    await pick(language, /Deutsch/);
    await expect.element(german).toHaveValue('Labels Deutsch');
    await expect.element(dialog().getByText('1/2 translated')).not.toBeInTheDocument();

    await dialog().getByRole('button', { name: 'Save' }).click();
    await vi.waitFor(() => expect(forms.posts).toHaveLength(1));
    expect(lastPost().formData.get('slug')).toBe('e2egrp');
    expect(lastPost().formData.get('label.en')).toBe('Labels English');
    expect(lastPost().formData.get('label.de')).toBe('Labels Deutsch');
    await expect.element(dialog()).not.toBeInTheDocument();
    await expect.element(own).not.toHaveTextContent('missing');
  });
});

describe('the relationship types catalog', () => {
  type Row = RelationshipsData['relationshipTypes'][number];
  type Properties = RelationshipsData['typeProperties'];
  const AUTHOR = { name: 'documents:author', group_slug: 'documents', label: { en: 'Author', de: 'Autor' }, datatype: 'text', description: {} };
  const STATUS = { name: 'core:status', group_slug: 'core', label: { en: 'Status', de: 'Status' }, datatype: 'text', description: {} };
  const data = (relationshipTypes: Row[], typeProperties: Properties = {}) =>
    ({ relationshipTypes, propertyDefinitions: [STATUS, AUTHOR], typeProperties }) as unknown as RelationshipsData;
  const type = (label: string): Row => ({ slug: 'e2e-rel-x', label: { en: label }, description: {}, inverse_label: null });

  it('posts slug and label, locks the slug when editing, and its properties dialog commits a searched definition as a chip on Enter and posts it', async () => {
    let types: Row[] = [];
    let properties: Properties = {};
    const view = render(RelationshipsPage, { data: data(types), form: null });
    forms.applied = async (result) => {
      if (result.type !== 'success') return;
      const post = lastPost();
      if (post.action === '?/save') types = [type(String(post.formData.get('label.en')))];
      if (post.action === '?/setProperties') {
        const names = post.formData.getAll('propertyNames').map(String);
        properties = { 'e2e-rel-x': [AUTHOR, STATUS].filter((d) => names.includes(d.name)).map(({ name, label, datatype }) => ({ name, label, datatype })) };
      }
      await view.rerender({ data: data(types, properties), form: { saved: true } });
    };

    await screen.getByRole('button', { name: 'Add relationship type' }).click();
    await expect.element(dialog()).toBeVisible();
    await dialog().getByLabelText('Slug', { exact: true }).fill('e2e-rel-x');
    await dialog().getByRole('textbox', { name: 'Label English', exact: true }).fill('E2E relates to');
    await dialog().getByRole('button', { name: 'Save' }).click();
    await vi.waitFor(() => expect(forms.posts).toHaveLength(1));
    expect(lastPost().action).toBe('?/save');
    expect(lastPost().formData.get('slug')).toBe('e2e-rel-x');
    expect(lastPost().formData.get('label.en')).toBe('E2E relates to');
    await expect.element(dialog()).not.toBeInTheDocument();

    const row = rowOf('e2e-rel-x');
    await expect.element(row).toHaveTextContent('E2E relates to');

    // Editing keeps the slug locked (it is the key) but changes the label.
    await row.getByRole('button', { name: 'Edit' }).click();
    await expect.element(dialog().getByRole('heading', { name: 'Update relationship type' })).toBeVisible();
    await expect.element(dialog().getByLabelText('Slug', { exact: true })).toHaveAttribute('readonly');
    const label = dialog().getByRole('textbox', { name: 'Label English', exact: true });
    await expect.element(label).toHaveValue('E2E relates to');
    await label.fill('E2E relates to (edited)');
    await dialog().getByRole('button', { name: 'Save' }).click();
    await vi.waitFor(() => expect(forms.posts).toHaveLength(2));
    expect(lastPost().formData.get('slug')).toBe('e2e-rel-x');
    expect(lastPost().formData.get('label.en')).toBe('E2E relates to (edited)');
    await expect.element(dialog()).not.toBeInTheDocument();
    await expect.element(row).toHaveTextContent('E2E relates to (edited)');

    // The per-row properties dialog.
    await row.getByRole('button', { name: 'Manage properties' }).click();
    await expect.element(dialog().getByRole('heading', { name: 'Properties for "e2e-rel-x"' })).toBeVisible();
    const search = dialog().getByPlaceholder('Search properties…');
    await search.fill('documents:author');
    await userEvent.keyboard('{Enter}');
    await expect.element(dialog().getByRole('button', { name: /^Remove.*documents:author/ })).toBeVisible();
    await dialog().getByRole('button', { name: 'Save' }).click();
    await vi.waitFor(() => expect(forms.posts).toHaveLength(3));
    expect(lastPost().action).toBe('?/setProperties');
    expect(lastPost().formData.get('slug')).toBe('e2e-rel-x');
    expect(lastPost().formData.getAll('propertyNames')).toEqual(['documents:author']);
    await expect.element(dialog()).not.toBeInTheDocument();
    await expect.element(row).toHaveTextContent('Author');

    await row.getByRole('button', { name: 'Delete' }).click();
    await vi.waitFor(() => expect(forms.posts).toHaveLength(4));
    expect(lastPost().action).toBe('?/delete');
    expect(lastPost().formData.get('slug')).toBe('e2e-rel-x');
  });
});
