// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import GraphView from './GraphView.svelte';
import type { GraphEdge, GraphNode } from '../types';

// One page linked to another twice (plain, and a typed "mentions" with a
// property), to a document and to a third page; at a desktop width, where the panel floats.

const NODES: GraphNode[] = [
  { id: 'n-graph', type: 'page', slug: 'graph-test-page', namespaceSlug: null, title: 'Graph Test Page' },
  { id: 'n-public', type: 'page', slug: 'public-page', namespaceSlug: null, title: 'Public Page' },
  { id: 'n-document', type: 'document', slug: 'public-document', namespaceSlug: null, title: 'Public Document' },
  { id: 'n-internal', type: 'page', slug: 'internal-page', namespaceSlug: null, title: 'Internal Page' },
];
const MENTIONS: GraphEdge = {
  source: 'n-graph',
  target: 'n-public',
  edgeId: 'l-mentions',
  relationshipType: 'mentions',
  relationshipLabel: 'mentions',
  properties: [{ name: 'edge:year', label: 'Year', value: '2020' }],
};
const EDGES: GraphEdge[] = [
  { source: 'n-graph', target: 'n-public', edgeId: 'l-plain' },
  MENTIONS,
  { source: 'n-graph', target: 'n-document', edgeId: 'l-document' },
  { source: 'n-graph', target: 'n-internal', edgeId: 'l-internal' },
];

const STORAGE_KEY = 'test.graph-view';
const node = (title: string) => screen.getByRole('img', { name: 'Page network' }).getByRole('button', { name: title, exact: true });
const drawnOnce = (title: string) => expect.poll(() => node(title).elements().length).toBe(1);
const svg = () => document.querySelector('svg.graph')!;

function graph() {
  render(GraphView, { nodes: NODES, edges: EDGES, storageKey: STORAGE_KEY });
}

beforeEach(async () => {
  await screen.viewport(1280, 800);
});

afterEach(() => {
  vi.useRealTimers();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // No storage: nothing was remembered.
  }
});

describe('the graph view', () => {
  it('draws a typed edge once as typed, its tooltip giving the relationship’s label and the edge’s property values, while the untyped edges stay plain and each node is drawn once', async () => {
    // Settle the layout first, so the edge stays where the pointer finds it.
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    graph();
    vi.advanceTimersByTime(20_000);
    vi.useRealTimers();

    for (const title of ['Graph Test Page', 'Public Page', 'Public Document', 'Internal Page']) await drawnOnce(title);
    expect(svg().querySelectorAll('line.edge.typed[data-relationship-type="mentions"]')).toHaveLength(1);
    expect(svg().querySelectorAll('line.edge:not(.typed)')).toHaveLength(3);
    const hits = svg().querySelectorAll('line.edge-hit');
    expect(hits).toHaveLength(1);
    expect(hits[0].getAttribute('data-relationship-type')).toBe('mentions');

    await screen.elementLocator(hits[0]).hover();
    await vi.waitFor(() => expect(document.querySelector('.edge-tooltip-label')?.textContent).toBe('mentions'));
    const props = document.querySelectorAll('.edge-tooltip-prop');
    expect(props).toHaveLength(1);
    expect(props[0].textContent).toContain('Year');
    expect(props[0].textContent).toContain('2020');

    await screen.getByRole('button', { name: 'Zoom in' }).hover();
    await vi.waitFor(() => expect(document.querySelector('.edge-tooltip-label')).toBeNull());
    // Drawn on the edge only when it fits, but never twice.
    expect([...svg().querySelectorAll('text.edge-label')].filter((t) => t.textContent === 'mentions').length).toBeLessThanOrEqual(1);
  });

  it('hides every page and keeps the documents with the Document type filter, marks the stats filtered, and Reset filters brings the pages back', async () => {
    graph();
    await drawnOnce('Graph Test Page');
    await screen.getByRole('button', { name: 'Display options', exact: true }).click();
    const panel = screen.getByRole('group', { name: 'Display options' });
    await panel.getByRole('combobox', { name: 'Type', exact: true }).click();
    await screen.getByRole('option', { name: 'Document', exact: true }).click();
    await userEvent.keyboard('{Escape}');

    for (const title of ['Graph Test Page', 'Public Page', 'Internal Page']) await expect.element(node(title)).not.toBeInTheDocument();
    await expect.element(node('Public Document')).toBeVisible();
    const stats = screen.getByText(/^1 of 4 nodes/);
    await expect.element(stats).toBeVisible();
    expect(stats.element().classList.contains('filtered')).toBe(true);

    await panel.getByRole('button', { name: 'Reset filters', exact: true }).click();
    await drawnOnce('Graph Test Page');
    await drawnOnce('Public Page');
    await expect.element(screen.getByText(/^1 of 4 nodes/)).not.toBeInTheDocument();
  });

  it('keeps each node drawn exactly once switching between Standard and Cluster and back', async () => {
    graph();
    await drawnOnce('Graph Test Page');
    await screen.getByRole('button', { name: 'Display options', exact: true }).click();
    const modes = screen.getByRole('group', { name: 'Layout mode' });
    for (const mode of ['Standard', 'Cluster', 'Standard']) {
      await modes.getByRole('radio', { name: mode, exact: true }).click();
      await expect.element(modes.getByRole('radio', { name: mode, exact: true })).toHaveAttribute('data-state', 'on');
      for (const title of ['Graph Test Page', 'Public Page', 'Public Document', 'Internal Page']) await drawnOnce(title);
    }
  });
});
