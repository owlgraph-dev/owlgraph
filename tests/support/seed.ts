// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The test seed for the e2e and integration global setups (docs/guides/testing.md,
// "The test databases"). platform/db.server binds DATABASE_URL at import, so a
// caller sets the URL first and then imports this module dynamically.
import { minimalPdf } from '../e2e/pdf';
import { db } from '../../src/lib/platform/db.server';
import { runMigrations } from '../../src/lib/platform/migrate.server';
import { createUser, createSession, createApiToken, type Role } from '../../src/lib/features/auth/server';
import {
  createPage,
  setPageVisibility,
  setPageShares,
  appendBlock,
  withPageDoc
} from '../../src/lib/features/pages/server';
import { setManualProperties, upsertPropertyDefinition, upsertPropertyGroup } from '../../src/lib/features/semantic/server';
import { upsertRelationshipType, setRelationshipTypeProperties } from '../../src/lib/features/semantic/server';
import { createDocument, setDocumentShares } from '../../src/lib/features/documents/server';
import { setNodeVisibility } from '../../src/lib/features/nodes/server';
import { ensureCoreClasses, getTypeClass, upsertNodeClass } from '../../src/lib/features/semantic/server';
import { CORE_GROUP_SEED, DOCUMENTS_GROUP_SEED, DOCUMENT_PROPERTY_SEEDS, TYPE_CLASS_SEEDS } from '../../src/lib/features/semantic/server';
import { getDefaultNamespace, setNamespaceAccessLevel } from '../../src/lib/features/namespaces/server';
import { createImageAsset } from '../../src/lib/features/media/server';
import { seedParagraphStylesIfEmpty } from '../../src/lib/features/content/server';
import { seedPageLayoutPresetsIfEmpty } from '../../src/lib/features/pages/server';

export type SeedRole = 'admin' | 'editorA' | 'editorB' | 'editorC' | 'viewer';

/** What `.seed.json` holds: the seeded ids, slugs, texts and tokens the tests refer to. */
export interface SeedRecord {
  publicSlug: string;
  publicTitle: string;
  publicId: string;
  internalSlug: string;
  internalTitle: string;
  internalId: string;
  restrictedId: string;
  restrictedSlug: string;
  restrictedTitle: string;
  publicBody: string;
  internalBody: string;
  restrictedBody: string;
  propStatus: string;
  propPriority: string;
  queryTestSlug: string;
  queryBlockId: string;
  docId: string;
  docSlug: string;
  publicDocId: string;
  publicDocSlug: string;
  restrictedDocId: string;
  restrictedDocSlug: string;
  mdDocId: string;
  mdDocSlug: string;
  publicAssetId: string;
  restrictedAssetId: string;
  graphPageId: string;
  graphPageSlug: string;
  relCrossPageId: string;
  crossRelationshipTypeSlug: string;
  relationshipTypeSlug: string;
  relationshipTypeLabel: string;
  edgePropYear: string;
  tokens: Record<SeedRole, string>;
}

export interface PreparedSeed {
  seed: SeedRecord;
  /** A session per role, for the e2e storage states. */
  sessions: Record<SeedRole, { token: string; expires: Date }>;
}

async function reset() {
  // `nodes` is listed: truncating pages and documents doesn't cascade up to
  // their nodes, which would surface as bogus graph nodes.
  await db.begin(async (sql) => {
    // The cascade reports every table it reaches as a NOTICE.
    await sql`set local client_min_messages = warning`;
    await sql.unsafe(`truncate table
      users, nodes, pages, sessions, api_tokens, page_shares, edges, edge_properties,
      node_properties, node_tags, property_definitions, relationship_types, site_settings, assets, documents,
      footer_links, themes, page_layout_presets, stylesheets, custom_styles,
      font_families, font_variants
      restart identity cascade`);
    // Trimmed back to their migrations' rows rather than truncated, so a
    // spec's namespaces and groups don't leak into the next run.
    await sql`delete from namespaces where not is_default`;
    await sql`update namespaces set slug = null, name = 'Default' where is_default`;
    await sql`delete from property_groups where slug not in ('core', 'documents')`;
  });
  await upsertPropertyGroup(CORE_GROUP_SEED);
}

// Seeded accounts sign in through stored sessions, not the form; the password
// only has to satisfy the password policy.
const E2E_PASSWORD = 'e2e-seed-password';

async function makeUser(email: string, role: Role) {
  return createUser({ email, name: email.split('@')[0], password: E2E_PASSWORD, role });
}

/**
 * Migrates the database, empties it back to what its migrations seed, and seeds
 * what the tests rely on, with new ids, slugs, sessions and tokens each call.
 * The caller ends the pool.
 */
export async function prepareTestDatabase(): Promise<PreparedSeed> {
  await runMigrations(db);
  // The one place the migrations' class hierarchy is seen before reset()
  // truncates it: missing, the migrations and ensureCoreClasses drifted.
  await getTypeClass(db, 'page');
  await getTypeClass(db, 'document');
  await getTypeClass(db, 'collection');
  await reset();

  // property_definitions is truncated, so the document editor's well-known
  // fields are re-seeded from their runtime twin (schemaSeeds.server.ts).
  await upsertPropertyGroup(DOCUMENTS_GROUP_SEED);
  for (const definition of DOCUMENT_PROPERTY_SEEDS) await upsertPropertyDefinition(definition);
  // The cascade from nodes empties node_classes, the core hierarchy every
  // createPage needs, and the paragraph styles (through users); the document
  // type's group is attached again below, since the migration does it on insert only.
  await ensureCoreClasses(db);
  await seedParagraphStylesIfEmpty(db);
  await seedPageLayoutPresetsIfEmpty(db);
  const documentType = await getTypeClass(db, 'document');
  const documentSeed = TYPE_CLASS_SEEDS.find((t) => t.slug === 'document')!;
  await upsertNodeClass({
    id: documentType.id,
    slug: documentType.slug,
    label: documentSeed.label,
    description: documentSeed.description,
    propertyGroup: 'documents',
  });

  // A node is never more accessible than its namespace (docs/architecture/authorization.md),
  // so a public fixture needs a public namespace: the suite opens the default
  // one (the app's stays internal), and the internal fixtures pin themselves.
  const defaultNs = await getDefaultNamespace();
  await setNamespaceAccessLevel(defaultNs.id, 'public');

  const admin = await makeUser('admin@test', 'admin');
  const editorA = await makeUser('editora@test', 'editor');
  const editorB = await makeUser('editorb@test', 'editor');
  const editorC = await makeUser('editorc@test', 'editor');
  const viewer = await makeUser('viewer@test', 'viewer');

  // One page of each visibility; editorB is shared on the restricted one.
  const publicBody = 'public body';
  const internalBody = 'internal body';
  const restrictedBody = 'secret body';

  const pub = await createPage('Public Page', editorA);
  await setPageVisibility(pub.id, 'public');
  await appendBlock(pub.id, { kind: 'paragraph', text: publicBody });

  const internal = await createPage('Internal Page', editorA);
  await setPageVisibility(internal.id, 'internal');
  await appendBlock(internal.id, { kind: 'paragraph', text: internalBody });

  const restricted = await createPage('Restricted Page', editorA);
  await setPageVisibility(restricted.id, 'restricted');
  await setPageShares(restricted.id, [editorB.id]);
  await appendBlock(restricted.id, { kind: 'paragraph', text: restrictedBody });

  // Properties across the three visibility tiers, for authorization under a
  // composed filter.
  const propStatus = 'core:status';
  const propPriority = 'core:priority';
  await upsertPropertyDefinition({ localName: 'status', groupSlug: 'core', datatype: 'text' });
  await upsertPropertyDefinition({ localName: 'priority', groupSlug: 'core', datatype: 'number' });
  await setManualProperties(pub.id, [
    { name: propStatus, value: 'active' },
    { name: propPriority, value: '1' }
  ]);
  await setManualProperties(internal.id, [
    { name: propStatus, value: 'active' },
    { name: propPriority, value: '2' }
  ]);
  await setManualProperties(restricted.id, [
    { name: propStatus, value: 'secret' },
    { name: propPriority, value: '3' }
  ]);

  // A public page whose query matches the restricted page too, so what renders
  // depends on the viewer's permissions, not the page's. Each instance binds a
  // marked paragraph and html tokens, typed and intrinsic. Written through
  // withPageDoc: BlockInput has no query block variant.
  const queryPage = await createPage('Query Test Page', editorA);
  await setPageVisibility(queryPage.id, 'public');
  const queryBlockId = 'queryblock-seed-1';
  await withPageDoc(queryPage.id, (doc) => {
    doc.content = doc.content ?? [];
    doc.content.push({
      type: 'queryBlock',
      attrs: {
        blockId: queryBlockId,
        filter: {
          or: [
            { property: { name: propStatus, operator: 'EQ', value: 'active' } },
            { property: { name: propStatus, operator: 'EQ', value: 'secret' } }
          ]
        },
        first: 20
      },
      content: [
        {
          type: 'grid',
          attrs: { columnWidths: [1] },
          content: [
            {
              type: 'gridCell',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'placeholder',
                      marks: [{ type: 'semanticProperty', attrs: { propName: propStatus } }]
                    }
                  ]
                },
                {
                  type: 'htmlBlock',
                  attrs: { html: `<p class="qb-html">Status: {{{${propStatus}}}} <time>{{{createdAt:date}}}</time> <span class="qb-class">{{{class}}}</span></p>` }
                }
              ]
            }
          ]
        }
      ]
    });
  });

  // After every appendBlock on these pages: saveDoc's reconcilePageAssets
  // would collect a page-scoped asset the page's doc doesn't reference.
  const doc = await createDocument({
    bytes: minimalPdf('seed document bytes'),
    mime: 'application/pdf',
    filename: 'seed.pdf',
    title: 'Seed Document',
    createdBy: editorA.id,
    user: editorA,
  });
  await setNodeVisibility(doc.id, 'internal', { touch: true });
  const publicDoc = await createDocument({
    bytes: minimalPdf('public document'),
    mime: 'application/pdf',
    filename: 'public.pdf',
    title: 'Public Document',
    createdBy: editorA.id,
    user: editorA,
  });
  await setNodeVisibility(publicDoc.id, 'public', { touch: true });
  const restrictedDoc = await createDocument({
    bytes: minimalPdf('restricted document'),
    mime: 'application/pdf',
    filename: 'restricted.pdf',
    title: 'Restricted Document',
    createdBy: editorA.id,
    user: editorA,
  });
  await setNodeVisibility(restrictedDoc.id, 'restricted', { touch: true });
  await setDocumentShares(restrictedDoc.id, [editorB.id]);
  // Known text, for text extraction.
  const mdDoc = await createDocument({
    bytes: Buffer.from('# Heading\n\nSearchable body text for extraction.'),
    mime: 'text/markdown',
    filename: 'note.md',
    title: 'Markdown Note',
    createdBy: editorA.id,
    user: editorA,
  });
  await setNodeVisibility(mdDoc.id, 'internal', { touch: true });
  // A real PNG: an upload is decoded, measured and cleaned (docs/architecture/media.md).
  const onePixelPng = () => Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const publicAsset = await createImageAsset({
    bytes: onePixelPng(),
    mime: 'image/png',
    ownerPageId: pub.id,
    createdBy: editorA.id,
  });
  const restrictedAsset = await createImageAsset({
    bytes: onePixelPng(),
    mime: 'image/png',
    ownerPageId: restricted.id,
    createdBy: editorA.id,
  });

  // Links to pages and documents of mixed visibility, by quick link and
  // inline link, derived through the real save path (syncEdges), so the graph
  // and incoming edges are viewer-scoped with one endpoint gated.
  const graphPage = await createPage('Graph Test Page', editorA);
  await setPageVisibility(graphPage.id, 'public');
  await appendBlock(graphPage.id, { kind: 'quickLink', targetPageId: pub.id, label: 'See public page' });
  await appendBlock(graphPage.id, { kind: 'quickLink', targetDocId: publicDoc.id, label: 'See public document' });

  // A typed edge with a property, between the same pair as the untyped
  // quick link above: the two must coexist as distinct links.
  const edgePropYear = 'edge:year';
  await upsertPropertyGroup({ slug: 'edge', label: { en: 'Edge properties' } });
  await upsertPropertyDefinition({ localName: 'year', groupSlug: 'edge', datatype: 'number' });
  const relationshipTypeSlug = 'mentions';
  const relationshipTypeLabel = 'Mentions';
  await upsertRelationshipType({
    slug: relationshipTypeSlug,
    label: { en: relationshipTypeLabel },
    inverseLabel: { en: 'Mentioned by' },
  });
  // Mapped one by one, so the type offers only what it was assigned, not its group.
  await setRelationshipTypeProperties(relationshipTypeSlug, [edgePropYear]);
  await appendBlock(graphPage.id, {
    kind: 'quickLink',
    targetPageId: pub.id,
    label: 'Mentions the public page',
    relationshipType: relationshipTypeSlug,
    properties: { [edgePropYear]: '2020' },
  });

  await appendBlock(graphPage.id, {
    kind: 'paragraph',
    text: `Also see [[${internal.id}|the internal page]] and [[doc:${restrictedDoc.id}|the restricted document]].`,
  });

  // A typed edge to the restricted page, for hiding the counterpart. Its own
  // type, so it doesn't change the counts of 'mentions' edges other tests assert.
  const relCrossPage = await createPage('Relationship Cross Page', editorA);
  await setPageVisibility(relCrossPage.id, 'public');
  const crossRelationshipTypeSlug = 'refers-to';
  await upsertRelationshipType({ slug: crossRelationshipTypeSlug, label: { en: 'Refers to' }, inverseLabel: { en: 'Referred to by' } });
  await appendBlock(relCrossPage.id, {
    kind: 'quickLink',
    targetPageId: restricted.id,
    label: 'Refers to the restricted page',
    relationshipType: crossRelationshipTypeSlug,
  });

  const users = { admin, editorA, editorB, editorC, viewer };
  const sessions = {} as PreparedSeed['sessions'];
  const tokens = {} as Record<SeedRole, string>;
  for (const [name, u] of Object.entries(users) as [SeedRole, { id: string }][]) {
    sessions[name] = await createSession(u.id);
  }
  for (const [name, u] of Object.entries(users) as [SeedRole, { id: string }][]) {
    tokens[name] = (await createApiToken(u.id, `e2e-${name}`)).token;
  }

  return {
    sessions,
    seed: {
      publicSlug: pub.slug,
      publicTitle: 'Public Page',
      publicId: pub.id,
      internalSlug: internal.slug,
      internalTitle: 'Internal Page',
      internalId: internal.id,
      restrictedId: restricted.id,
      restrictedSlug: restricted.slug,
      restrictedTitle: 'Restricted Page',
      publicBody,
      internalBody,
      restrictedBody,
      propStatus,
      propPriority,
      queryTestSlug: queryPage.slug,
      queryBlockId,
      docId: doc.id,
      docSlug: doc.slug,
      publicDocId: publicDoc.id,
      publicDocSlug: publicDoc.slug,
      restrictedDocId: restrictedDoc.id,
      restrictedDocSlug: restrictedDoc.slug,
      mdDocId: mdDoc.id,
      mdDocSlug: mdDoc.slug,
      publicAssetId: publicAsset.id,
      restrictedAssetId: restrictedAsset.id,
      graphPageId: graphPage.id,
      graphPageSlug: graphPage.slug,
      relCrossPageId: relCrossPage.id,
      crossRelationshipTypeSlug,
      relationshipTypeSlug,
      relationshipTypeLabel,
      edgePropYear,
      tokens,
    },
  };
}

/** Ends this module's database pool, so the database can be cloned or dropped. */
export async function closeSeedConnection(): Promise<void> {
  await db.end({ timeout: 5 });
}
