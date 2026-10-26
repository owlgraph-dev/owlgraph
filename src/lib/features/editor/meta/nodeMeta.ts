// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The prop contract for editing a node's metadata, shared by every editor
// shell. State props come from the edit route's load; action props are wired
// to the typed API clients (features/nodes/client.ts and friends).
import type { NodeClassOption, ClassFields } from '$lib/features/semantic';
import type { ContentScheme } from '$lib/features/content';
import type { DocumentSource } from '$lib/features/documents';
import type { CollectionMember } from '$lib/features/collections';
import type { CollectionSourceView } from '$lib/features/pluginHost';

export interface NodeProperty {
  name: string;
  value: string;
}

export interface NodeMetaState {
  title?: string;
  slug?: string;
  namespaceSlug?: string | null;
  tags?: string[];
  tagSuggestions?: string[];
  manualProperties?: NodeProperty[];
  propSuggestions?: { name: string; label: string; datatype: string }[];
  propertyGroups?: { slug: string; label: string; description: string }[];
  // The class's accumulated definitions render as first-class fields.
  nodeClassId?: string | null;
  nodeClasses?: NodeClassOption[];
  classFields?: ClassFields | null;
  // The content language (docs/architecture/languages.md).
  locale?: string;
  // A document only: the language detected in its text, offered until the
  // author takes or dismisses it, never applied silently.
  localeSuggestion?: string | null;
  // As stored: null inherits the namespace. namespaceAccessLevel is required,
  // since without it the access panel can't tell what "inherit" means.
  visibility?: string | null;
  namespaceAccessLevel: string;
  namespaceMembers?: { id: string; name: string; email: string }[];
  shares?: string[];
  users?: { id: string; name: string; email: string }[];
  shareLinks?: { id: string; label: string; createdAt: string }[];
  namespaceId?: string;
  namespaces?: { id: string; name: string; slug: string | null; isDefault: boolean }[];
}

export interface NodeMetaActions {
  onRename?: (changes: { title?: string; slug?: string }) => Promise<{ ok: boolean; title?: string; slug?: string; error?: string }>;
  onSetTags?: (tags: string[]) => Promise<{ ok: boolean; tags?: string[] }>;
  onSetManualProperties?: (props: NodeProperty[]) => Promise<{ ok: boolean; properties?: NodeProperty[] }>;
  onSetNodeClass?: (id: string | null) => Promise<{ ok: boolean; error?: string } | undefined>;
  onSetLocale?: (locale: string) => Promise<{ ok: boolean; error?: string }>;
  onDismissLocaleSuggestion?: () => Promise<{ ok: boolean }>;
  onSetVisibility?: (visibility: string | null) => Promise<{ ok: boolean; visibility?: string | null }>;
  onSetShares?: (shares: string[]) => Promise<{ ok: boolean; shares?: string[] }>;
  onCreateShareLink?: (label: string) => Promise<{ ok: boolean; id?: string; token?: string; label?: string; createdAt?: string; error?: string }>;
  onRevokeShareLink?: (id: string) => Promise<{ ok: boolean }>;
  onSetNamespace?: (namespaceId: string) => Promise<{ ok: boolean; error?: string }>;
  onDelete?: () => Promise<{ ok: true } | { ok: false; error: string }>;
}

export type NodeMetaProps = NodeMetaState & NodeMetaActions;

export interface PageEditorProps extends NodeMetaProps {
  doc: unknown;
  pageId?: string;
  /**
   * `acknowledgeDropped`: the blocks this build can't show that the author
   * deleted, by key — what the save may remove (pages/unknownGuard.ts).
   * `lockLost` marks a failure the lock-lost banner already reports;
   * `unknownDropped` one that sending again cannot fix.
   */
  onSave: (json: unknown, opts: { acknowledgeDropped: readonly string[] }) => Promise<{ ok: boolean; lockLost?: boolean; unknownDropped?: boolean } | void>;
  // Load-time id -> path snapshots for the pageLink/docLink/quickLink hrefs.
  pages?: Array<{ id: string; slug: string; namespaceSlug?: string | null; title: string }>;
  /** The documents the editor may read; a document's plugin is the integration that keeps it (null for an upload or a link). */
  documents?: Array<{ id: string; slug: string; namespaceSlug?: string | null; title: string; plugin?: string | null }>;
  /** The plugins turned on (their ids): the Insert menu offers their blocks, and a block's picker shows their nodes by their kinds. */
  enabledPlugins?: readonly string[];
  onUploadImage?: (file: File) => Promise<{ id: string } | null>;
  lockLost?: boolean;
  /**
   * Called with the editor's document, whether it held unsaved work, and
   * EditorCore.heldJSON, through which the stored page compares with it block by block.
   */
  onLockLost?: (doc: unknown, dirty: boolean, held: (doc: unknown) => unknown) => void;
  isHomePage?: boolean;
  // null = the site default (docs/architecture/theming.md, "Content scheme").
  contentScheme?: ContentScheme | null;
  contentSchemeDefault?: ContentScheme;
  onSetContentScheme?: (scheme: ContentScheme | null) => Promise<{ ok: boolean }>;
}

export interface DocumentEditorProps extends NodeMetaProps {
  documentId: string;
  title: string;
  slug: string;
  namespaceSlug: string | null;
  source: DocumentSource;
  /** The integration a 'plugin' document comes from (its plugin id); null otherwise. */
  plugin: string | null;
  externalUrl: string | null;
  filename: string;
  mime: string | null;
  size: number | null;
  tags: string[];
  manualProperties: NodeProperty[];
  visibility: string | null;
  onReplaceFile?: (file: File) => Promise<{ ok: boolean; filename?: string; mime?: string; size?: number; error?: string }>;
  onSetLink?: (url: string) => Promise<{ ok: true; externalUrl: string } | { ok: false; error: string }>;
}

export interface CollectionEditorProps extends NodeMetaProps {
  collectionId: string;
  title: string;
  slug: string;
  namespaceSlug: string | null;
  /** A mirrored collection's source, as its integration describes it; null for a curated one. */
  source?: CollectionSourceView | null;
  /** After its source was connected anew; the page reloads what it shows. */
  onSourceConnected?: () => void;
  members?: CollectionMember[];
  /** The basis of the members' order as read, which a rearrangement of a curated collection names. */
  membersBasis?: string;
  // As stored: null inherits the namespace's access level.
  visibility: string | null;
}
