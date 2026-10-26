<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import Table, { type TableColumn } from '../../Table.svelte';
  import TableRow from '../../TableRow.svelte';
  import TableCell from '../../TableCell.svelte';
  import Button from '../../Button.svelte';
  import Icon from '../../Icon.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  const catalogColumns: TableColumn[] = [
    { label: 'Name', width: '14rem' },
    { label: 'Key', width: '11rem' },
    { label: 'Description' },
    { label: 'Count', width: '6rem', align: 'end' },
    { label: 'Actions', width: '6rem', hideLabel: true },
  ];

  const properties = [
    { name: 'Title', key: 'title', description: 'The human-readable name of a node.', count: 1284 },
    { name: 'Published at', key: 'published_at', description: 'When the page went live. Read from the document on save, never edited by hand — and this sentence is long enough to truncate.', count: 942 },
    { name: 'Author', key: 'author', description: 'Who wrote it.', count: 611 },
  ];

  const treeColumns: TableColumn[] = [
    { label: 'Class', width: '16rem' },
    { label: 'Key', width: '10rem' },
    { label: 'Pages', width: '6rem', align: 'end' },
    { label: 'Actions', width: '6rem', hideLabel: true },
  ];

  const scrollColumns: TableColumn[] = [
    { label: 'Name', width: '12rem' },
    { label: 'Namespace', width: '10rem' },
    { label: 'Owner', width: '12rem' },
    { label: 'Created', width: '10rem' },
    { label: 'Updated', width: '10rem' },
    { label: 'Visibility', width: '8rem' },
    { label: 'Actions', width: '6rem', hideLabel: true },
  ];
</script>

<SpecimenGrid title="Columns, cells and row actions">
  <Specimen label="declared columns: width, align end, hideLabel actions; mono / truncate+title / align end / actions cells" state="catalog" wide>
    <Table columns={catalogColumns} ariaLabel="Properties">
      {#each properties as p (p.key)}
        <TableRow data-id={p.key}>
          <TableCell truncate title={p.name}>{p.name}</TableCell>
          <TableCell mono title={p.key}>{p.key}</TableCell>
          <TableCell truncate title={p.description}>{p.description}</TableCell>
          <TableCell align="end" nowrap>{p.count}</TableCell>
          <TableCell actions>
            <Button icon size="sm" variant="ghost" title="Edit" aria-label="Edit {p.name}"><Icon name="pencil" /></Button>
            <Button icon size="sm" variant="ghost-danger" title="Delete" aria-label="Delete {p.name}"><Icon name="trash" /></Button>
          </TableCell>
        </TableRow>
      {/each}
    </Table>
  </Specimen>

  <Specimen label="TableRow tone=muted (locked core entry) and TableCell muted" state="row-muted" wide>
    <Table columns={catalogColumns} ariaLabel="Properties with a locked row">
      <TableRow tone="muted">
        <TableCell truncate title="Identifier">Identifier</TableCell>
        <TableCell mono title="id">id</TableCell>
        <TableCell muted truncate title="Core property, cannot be edited.">Core property, cannot be edited.</TableCell>
        <TableCell align="end" nowrap>1284</TableCell>
        <TableCell actions>
          <Button icon size="sm" variant="ghost" title="Edit" aria-label="Edit Identifier" disabled><Icon name="pencil" /></Button>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell truncate title="Title">Title</TableCell>
        <TableCell mono title="title">title</TableCell>
        <TableCell truncate title="The human-readable name of a node.">The human-readable name of a node.</TableCell>
        <TableCell align="end" nowrap>1284</TableCell>
        <TableCell actions>
          <Button icon size="sm" variant="ghost" title="Edit" aria-label="Edit Title"><Icon name="pencil" /></Button>
          <Button icon size="sm" variant="ghost-danger" title="Delete" aria-label="Delete Title"><Icon name="trash" /></Button>
        </TableCell>
      </TableRow>
    </Table>
  </Specimen>

  <Specimen label="nowrap vs truncate on a long value" state="cell-nowrap" wide>
    <Table columns={[{ label: 'Truncate', width: '12rem' }, { label: 'Nowrap', width: '12rem' }, { label: 'Wrapping (neither)' }]} ariaLabel="Cell overflow modes">
      <TableRow>
        <TableCell truncate title="A value long enough to overflow its column and show the ellipsis">A value long enough to overflow its column and show the ellipsis</TableCell>
        <TableCell nowrap>A value long enough to overflow its column, clipped hard</TableCell>
        <TableCell>Wraps onto more lines than the fixed row height was made for, which is why long values truncate instead.</TableCell>
      </TableRow>
    </Table>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Tree rows (indent)">
  <Specimen label="indent 0 / 1 / 2 with branch glyph" state="tree" wide>
    <Table columns={treeColumns} ariaLabel="Classes">
      <TableRow>
        <TableCell indent={0} truncate title="Document">Document</TableCell>
        <TableCell mono title="document">document</TableCell>
        <TableCell align="end" nowrap>310</TableCell>
        <TableCell actions>
          <Button icon size="sm" variant="ghost" title="Edit" aria-label="Edit Document"><Icon name="pencil" /></Button>
          <Button icon size="sm" variant="ghost-danger" title="Delete" aria-label="Delete Document"><Icon name="trash" /></Button>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell indent={1} truncate title="Article">Article</TableCell>
        <TableCell mono title="article">article</TableCell>
        <TableCell align="end" nowrap>120</TableCell>
        <TableCell actions>
          <Button icon size="sm" variant="ghost" title="Edit" aria-label="Edit Article"><Icon name="pencil" /></Button>
          <Button icon size="sm" variant="ghost-danger" title="Delete" aria-label="Delete Article"><Icon name="trash" /></Button>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell indent={2} truncate title="Release note">Release note</TableCell>
        <TableCell mono title="release_note">release_note</TableCell>
        <TableCell align="end" nowrap>18</TableCell>
        <TableCell actions>
          <Button icon size="sm" variant="ghost" title="Edit" aria-label="Edit Release note"><Icon name="pencil" /></Button>
          <Button icon size="sm" variant="ghost-danger" title="Delete" aria-label="Delete Release note"><Icon name="trash" /></Button>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell indent={1} truncate title="Guide">Guide</TableCell>
        <TableCell mono title="guide">guide</TableCell>
        <TableCell align="end" nowrap>42</TableCell>
        <TableCell actions>
          <Button icon size="sm" variant="ghost" title="Edit" aria-label="Edit Guide"><Icon name="pencil" /></Button>
          <Button icon size="sm" variant="ghost-danger" title="Delete" aria-label="Delete Guide"><Icon name="trash" /></Button>
        </TableCell>
      </TableRow>
    </Table>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Empty state and horizontal scroll">
  <Specimen label="empty state row (one muted cell spanning all columns)" state="empty" wide>
    <Table columns={catalogColumns} ariaLabel="Properties (empty)">
      <TableRow>
        <TableCell muted colspan={catalogColumns.length}>No properties yet. Use Add property to create the first one.</TableCell>
      </TableRow>
    </Table>
  </Specimen>
  <Specimen label="minWidth=72rem: scrolls inside the wrapper, never reflows" state="scroll" wide>
    <Table columns={scrollColumns} minWidth="72rem" ariaLabel="Pages">
      {#each ['Home', 'About', 'Contact'] as name (name)}
        <TableRow>
          <TableCell truncate title={name}>{name}</TableCell>
          <TableCell mono title="site">site</TableCell>
          <TableCell truncate title="Alex Example">Alex Example</TableCell>
          <TableCell nowrap>2026-09-01</TableCell>
          <TableCell nowrap>2026-09-14</TableCell>
          <TableCell nowrap>Public</TableCell>
          <TableCell actions>
            <Button icon size="sm" variant="ghost" title="Edit" aria-label="Edit {name}"><Icon name="pencil" /></Button>
            <Button icon size="sm" variant="ghost-danger" title="Delete" aria-label="Delete {name}"><Icon name="trash" /></Button>
          </TableCell>
        </TableRow>
      {/each}
    </Table>
  </Specimen>
</SpecimenGrid>
