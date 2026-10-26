// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The plugin contract (docs/architecture/plugins.md, "The contract"): one half per audience,
// each reaching only the bundle that needs it. The core reaches a plugin only
// through the registry files beside this one; a plugin reaches the core only
// through this contract and what scripts/check-boundaries.mjs allows.
//
// Imports from content and platform are type-only: content's catalogue spreads
// the manifests, so a runtime import back would close an ESM cycle (and naming
// its derived kind names here would infer them from themselves); the browser
// halves import this file.
import type { Component } from 'svelte';
import type { AnyExtension, Editor } from '@tiptap/core';
import type { z } from 'zod';
import type {
  Attrs,
  BlockFacets,
  BlockKind,
  BlockRenderer,
  DefaultValues,
  JsonNode,
  PlacementKind,
  ResolvedBlockDefaults,
  SurfaceBoxField,
} from '$lib/features/content';
import type { UpstreamClient } from '$lib/platform/upstream.server';
import { baseLocale, getLocale, type Locale } from '$lib/paraglide/runtime';

export type { UpstreamFailure, UpstreamRequest, UpstreamResult, UpstreamStreamResult } from '$lib/platform/upstream.server';

// --- the manifest -------------------------------------------------------------

/** A block kind a plugin adds to the content catalogue. */
export interface PluginBlockKind extends BlockKind {
  /** Its text, links and summary, as other features ask them (content/blocks/facets.ts). */
  facets?: BlockFacets;
  /** A minimal stored node of the kind, with a block id; the contract test renders it. */
  sample: JsonNode;
}

/** A contribution point the contract names but no plugin can fill yet. */
type Reserved = readonly never[];

export interface PluginManifest {
  /** The plugin's directory under src/lib/plugins/, lowercase. */
  id: string;
  /** Its name in the interface. */
  label: () => string;
  /** The block kinds it adds, in catalogue order. */
  blocks: readonly PluginBlockKind[];
  /** Its section under Settings → Integrations, with the switch that turns it on; without one it is always on. */
  settings?: PluginSettingsSection;
  /** The forms that connect a node to the plugin's source, by node type. */
  sources?: { collection?: PluginSourceForm };
  /** Lets a person connect their own account at the plugin's service; the server half's `connections` runs the handshake. */
  connections?: PluginConnectionsManifest;
  mcpTools?: Reserved;
  querySources?: Reserved;
}

/** Declares a manifest, keeping its block kinds' names literal. */
export function definePlugin<const M extends PluginManifest>(manifest: M): M {
  return manifest;
}

export type BlockNamesOf<M extends PluginManifest> = M['blocks'][number]['name'];

// --- connections ----------------------------------------------------------------

export type ConnectionCredentialKind = 'app_password';

/** What the manifest says of its connections: plain data, for the pages that list them. */
export interface PluginConnectionsManifest {
  kinds: readonly ConnectionCredentialKind[];
  /** One line on the connections page: what connecting gives the person. */
  intro: () => string;
}

/** A person's credential at the plugin's service. The core keeps it sealed; the plugin never stores it. */
export interface PluginCredential {
  kind: ConnectionCredentialKind;
  /** The login name the service checks the secret against. */
  login: string;
  secret: string;
}

// --- settings -------------------------------------------------------------------

interface FieldBase {
  /** Its key in the stored values: a lowercase identifier. */
  key: string;
  label: () => string;
  description?: () => string;
}

/**
 * The service's address: a bare https origin, normalized; http only for a
 * loopback host where the deployment allows it (platform/upstream.server.ts).
 * The host's upstream client is pinned to it, so a plugin declares at most one.
 */
export interface PluginOriginField extends FieldBase {
  kind: 'origin';
}

/** A whole number in a range. */
export interface PluginNumberField extends FieldBase {
  kind: 'number';
  min: number;
  max: number;
  default: number;
  /** What it counts, shown after the input ("seconds"). */
  unit?: () => string;
}

/** A field of a plugin's settings section, which the core draws, checks and stores. */
export type PluginSettingsField = PluginOriginField | PluginNumberField;

export interface PluginSettingsSection {
  /** One line under the section's title. */
  intro: () => string;
  fields: readonly PluginSettingsField[];
}

/** Settings values by field key: an origin is a string, or null while unset; a number is a number. */
export type PluginSettingsValues = Readonly<Record<string, string | number | null>>;

export interface PluginSettings {
  enabled: boolean;
  values: PluginSettingsValues;
}

// --- sources --------------------------------------------------------------------

/** A field of the form that connects a node to its source: read by the plugin's server half alone, never stored as given. */
export interface PluginConnectField {
  key: string;
  /** A `password` is never shown again. */
  kind: 'url' | 'password';
  label: () => string;
  description?: () => string;
  required: boolean;
}

export interface PluginSourceForm {
  fields: readonly PluginConnectField[];
}

// --- the page -----------------------------------------------------------------

/** One renderer per block kind the manifest adds, or it does not compile. */
export type PluginRenderers<M extends PluginManifest> = Readonly<Record<BlockNamesOf<M>, BlockRenderer>>;

export function definePluginRenderers<M extends PluginManifest>(_manifest: M, renderers: PluginRenderers<M>): PluginRenderers<M> {
  return renderers;
}

/** The components a plugin's blocks hydrate on the page, by island kind. */
export type PluginIslands = Readonly<Record<string, Component<any>>>;

// --- a node's own page ----------------------------------------------------------

/**
 * The props of a plugin node's page body, below the core's header (docs/architecture/plugins.md, "Node views").
 * It speaks the interface's language: the node route is the app's, not the content's.
 */
export interface PluginNodeBodyProps {
  node: { id: string; type: 'collection'; title: string; href: string };
  canWrite: boolean;
  /** What the server half's `nodeView` resolved for this viewer: plain JSON. */
  data: unknown;
  /** The language its numbers and dates are written in, as its texts are. */
  locale: string;
  /** Call when the body changed what the core shows around it (a document made of a file); the core reloads the page's data. */
  onChange(): void;
}

/** The bodies of the plugin's nodes' own pages, by node type. */
export interface PluginNodeViews<M extends PluginManifest = PluginManifest> {
  id: M['id'];
  collection?: Component<PluginNodeBodyProps>;
}

export function definePluginNodeViews<M extends PluginManifest>(_manifest: M, views: PluginNodeViews<M>): PluginNodeViews<M> {
  return views;
}

// --- the editor ---------------------------------------------------------------

/** What the editor hands a plugin's Tiptap extensions when it mounts. */
export interface PluginEditorContext {
  /** Null where no page is (a fixture). */
  pageId: string | null;
  /** False in the phone editor, which draws no construction chrome. */
  interactive: boolean;
  /** A page's or a document's href in the editor, as of when the editor loaded. */
  resolvePageHref(id: string): string;
  resolveDocHref(id: string): string;
}

/** The selection a block settings section edits (the block settings panel's target). */
export interface PluginTarget {
  type: string;
  id: string | null;
  attrs: Record<string, unknown>;
  update(patch: Record<string, unknown>): void;
}

export interface PluginSectionProps {
  target: PluginTarget;
  editor: Editor | null;
  /** The page being edited: where a section creates what its block needs. */
  pageId: string | null;
  /** Reports a popover or menu of the section opening or closing, for the editor's Escape handling. */
  overlayOpenChange(open: boolean): void;
}

/** One of a block's own block settings sections. The block settings panel draws its frame (BlockSettingsSection), the plugin its rows. */
export interface PluginBlockSettingsSection {
  /** Folds with the sections of the same id on every plugin block ('source', 'display', …). */
  id: string;
  title: () => string;
  component: Component<PluginSectionProps>;
  /** The attrs that mark the section modified when they differ from their schema default. */
  modifiedKeys?: readonly string[];
}

/** An entry of the Insert menu's integrations group. */
export interface PluginInsertItem {
  label: () => string;
  title?: () => string;
  /** A glyph of the design system's Icon. */
  icon: string;
  node: () => JsonNode;
}

/** A block kind's editor half. */
export interface PluginEditorBlock {
  /** Its Tiptap node, NodeView included (content's svelteNodeView). */
  extension: (ctx: PluginEditorContext) => AnyExtension;
  /** Its name in the breadcrumb and the block settings panel. */
  label: () => string;
  insert?: PluginInsertItem;
  sections?: readonly PluginBlockSettingsSection[];
  /** How the Placement control places it (editor/blocks/catalog.ts); default 'box'. */
  placement?: PlacementKind;
  /** The Surface fields the block settings panel offers; default all four. */
  surfaceFields?: (attrs: Attrs) => readonly SurfaceBoxField[];
  /** What its Auto rows show, given its group's defaults. */
  defaults?: (attrs: Attrs, own: DefaultValues, blockDefaults: ResolvedBlockDefaults) => DefaultValues;
}

export interface PluginEditor<M extends PluginManifest = PluginManifest> {
  id: M['id'];
  /** One entry per block kind the manifest adds, or it does not compile. */
  blocks: Readonly<Record<BlockNamesOf<M>, PluginEditorBlock>>;
}

export function definePluginEditor<M extends PluginManifest>(_manifest: M, editor: PluginEditor<M>): PluginEditor<M> {
  return editor;
}

// --- what an agent may author ------------------------------------------------

/**
 * One of the plugin's block kinds as an agent authors it (append_block, update_block, set_cell;
 * docs/architecture/mcp.md): the shape the MCP tools check, and the node it becomes. `kind` joins the core's
 * block taxonomy, so it must be a literal no other block input uses.
 */
export interface PluginBlockInput<S extends z.ZodDiscriminatedUnionOption<'kind'> = z.ZodDiscriminatedUnionOption<'kind'>> {
  /** The manifest's block kind it becomes, so the core can name the agent's kind for a stored node. */
  block: string;
  shape: S;
  /** The node an input becomes as given, with a fresh block id; sparse, so what the agent leaves out stays the default. */
  node(input: z.infer<S>): JsonNode;
  /**
   * The node an input becomes once what it names is read through the host, as the agent.
   * Throws, with a sentence for the agent, when the agent may not read that, it is not the plugin's, or the plugin is off.
   */
  build(input: z.infer<S>, host: PluginHost): Promise<JsonNode>;
  /** Its paragraph in append_block's description: what the kind is and how an agent fills it. */
  describe(): string;
}

/** Declares a plugin's block inputs, keeping each one's literal shape (the core's taxonomy is a static union). */
export function definePluginInputs<M extends PluginManifest, const T extends readonly PluginBlockInput<any>[]>(_manifest: M, inputs: T): T {
  return inputs;
}

// --- the server -----------------------------------------------------------------

/** Who may call a plugin route: anyone (the handler asks the host about every node), a signed-in user, or a holder of integration:manage. */
export type PluginRouteAccess = 'public' | 'signed-in' | 'manage';

export interface PluginRequest {
  /** The values of the path's `:name` segments, decoded. */
  params: Readonly<Record<string, string>>;
  query: URLSearchParams;
  /** A write's parsed JSON body (the core accepts no other); undefined for a read. */
  body: unknown;
}

/** A route under /api/plugins/<id>/; the core's dispatcher matches it, checks its access and rate-limits it. */
export interface PluginRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Below /api/plugins/<id>/: literal segments and `:name` parameters ('documents/:id/check'). */
  path: string;
  access: PluginRouteAccess;
  /**
   * The service checks a credential the caller supplies (a share's password). A 4xx answer spends one of the
   * caller's few failed checks, and a caller who spent them waits: a guess costs that person, never the
   * address all readers share (docs/architecture/plugins.md, "Routes").
   */
  checksCredential?: boolean;
  handle(request: PluginRequest, host: PluginHost): Promise<Response>;
}

/** One block a resolver is asked about. */
export interface PluginBlockRef {
  blockId: string;
  attrs: Readonly<Record<string, unknown>>;
}

/**
 * What a page's blocks of one kind need from outside the document, for the viewer, by block id
 * (RenderContext.blockData). The page waits for it, so it must never wait on the service: read what
 * the plugin holds, and start fetching what it lacks without awaiting it.
 */
export type PluginBlockDataResolver = (blocks: readonly PluginBlockRef[], host: PluginHost) => Promise<Readonly<Record<string, unknown>>>;

/** How a connect went: the status it answers with, a code of the plugin's and a sentence for the person who asked. */
export type PluginConnectResult = { ok: true } | { ok: false; status: 400 | 403 | 409 | 502; code: string; message: string };

/** What a node's source panel says of its source, in the interface's words. */
export interface PluginSourceSummary {
  /** The source's own name (a folder's). */
  name: string;
  /** One more fact, or null ("37 entries"). */
  detail: string | null;
  /** When its state was last established (ISO), or null. */
  checkedAt: string | null;
  /** What is wrong with it, or null while it answers. */
  problem: string | null;
}

/** An action in a node page's header: a path on this app, or an address at the plugin's service (its origin setting). */
export interface PluginNodeAction {
  id: string;
  label: string;
  href: string;
  /** An address at the service, opened in a tab of its own. */
  external: boolean;
}

/** What a node's own page shows of the plugin's source, for one viewer. */
export interface PluginNodeViewData {
  /** The body's `data` (PluginNodeBodyProps). */
  data: unknown;
  /** How the node can be read, after the plugin's name on the header's source chip ("Share", "Own files"); null to say nothing. */
  readsVia: string | null;
  /** What the source holds, in a few words ("37 entries"); null when not known yet. */
  detail: string | null;
  actions: readonly PluginNodeAction[];
}

/** What a node's search words are made from. */
export interface PluginSearchNode {
  type: 'collection' | 'document';
  title: string;
  ref: Readonly<Record<string, unknown>>;
  file: PluginFile | null;
}

/** How the plugin's source answers for the nodes it backs. */
export interface PluginNodeSource {
  /**
   * A document's content once the core has checked the reader (its content route, a share link's too):
   * typically a redirect to a grant (`host.grants`). Null is a 404.
   */
  serveDocument?(doc: PluginNode, opts: { download: boolean }, host: PluginHost): Promise<Response | null>;
  /** Connects a collection anew from the manifest's connect form (PUT /api/collections/<id>/source); the core has checked the writer. */
  connectCollection?(collection: PluginNode, values: Readonly<Record<string, string>>, host: PluginHost): Promise<PluginConnectResult>;
  /** What a collection's source panel says, from the plugin's record alone (no request to the service). */
  describeCollection?(collection: PluginNode): PluginSourceSummary;
  /**
   * What a node's own page shows of its source, for a viewer the core has checked may read the node. Like
   * block data, from what the plugin holds: the page never waits on the service. Null leaves the page to
   * the core's view (the plugin is off). Only a plugin whose node views draw the type implements it.
   */
  nodeView?(node: PluginNode, ctx: { canWrite: boolean }, host: PluginHost): Promise<PluginNodeViewData | null>;
  /**
   * The names a search finds the node by besides its title (a folder's, the folders a file sits in, the
   * file's), from the record and the file alone, with no request to the service. Plain words, never a
   * credential; the host stores them whenever it writes the node's record.
   */
  searchText?(node: PluginSearchNode): string;
}

export interface PluginServer<M extends PluginManifest = PluginManifest> {
  id: M['id'];
  routes?: readonly PluginRoute[];
  settings?: {
    /** Problems with values that pass their fields' own rules, by field key, in the interface's words. */
    validate?(values: PluginSettingsValues): Readonly<Record<string, string>>;
    /** Probes the service at the values about to be saved ("Check connection"), through a client pinned to their origin. */
    check?(upstream: PluginUpstream, values: PluginSettingsValues): Promise<{ ok: boolean; message: string }>;
  };
  /** Per block kind, its resolver; a kind without one renders as if nothing was resolved. */
  blockData?: Partial<Readonly<Record<BlockNamesOf<M>, PluginBlockDataResolver>>>;
  nodeSource?: PluginNodeSource;
  /** Present exactly when the manifest declares `connections`. */
  connections?: PluginConnectionFlow;
}

/** A client pinned to the plugin's origin that may also write (POST, DELETE): only the connect steps get one, every other client reads. */
export type PluginFlowClient = PluginUpstream;

/**
 * The plugin's steps of connecting a person's account; the core runs the rest of the flow (the page, the
 * waiting, the storage, the sealing). A step that cannot read the service's answer says so; it never passes
 * on a message quoting what it was given.
 */
export interface PluginConnectionFlow {
  /**
   * Starts a connect: where the person approves it (on the plugin's origin; the core checks) and an opaque
   * handle to poll with, which the core seals and never sends to a browser.
   */
  begin(client: PluginFlowClient, opts: { clientName: string }): Promise<{ ok: true; approveUrl: string; handle: string; ttlSeconds: number } | { ok: false; reason: 'unreachable' | 'refused' }>;
  /** Whether the person approved: the credential, once (the service then forgets the flow), and the server it names (the core checks its host). */
  poll(client: PluginFlowClient, handle: string): Promise<{ state: 'pending' | 'gone' | 'failed' } | { state: 'approved'; server: string; credential: PluginCredential }>;
  /** Who the credential is at the service, or that the service refuses it. */
  verify(client: PluginFlowClient, credential: PluginCredential): Promise<{ ok: true; accountId: string; accountLabel: string } | { ok: false; reason: 'unauthorized' | 'unreachable' }>;
  /** Asks the service to forget the credential; false when it could not (the core removes the connection anyway). */
  revoke(client: PluginFlowClient, credential: PluginCredential): Promise<boolean>;
}

export function definePluginServer<M extends PluginManifest>(_manifest: M, server: PluginServer<M>): PluginServer<M> {
  return server;
}

// --- the host -------------------------------------------------------------------

/** The client pinned to the plugin's origin setting (platform/upstream.server.ts). */
export type PluginUpstream = UpstreamClient;

/** A document's file as its source last reported it. */
export interface PluginFile {
  filename: string;
  mime: string | null;
  size: number | null;
}

/** A node the plugin's source backs, as the host shows it to the plugin. */
export interface PluginNode {
  id: string;
  type: 'collection' | 'document';
  title: string;
  /** Its address in the app. */
  href: string;
  /** The plugin's own record of the source (source_ref): a path, an id, what it last saw; never a credential. */
  ref: Readonly<Record<string, unknown>>;
  /** Null for a collection. */
  file: PluginFile | null;
  /** A document's content links, shown and as a download: the same for every reader, answered for whoever may read it; null for a collection. */
  content: { view: string; download: string } | null;
}

export type PluginWriteResult = { ok: true; node: PluginNode; created: boolean } | { ok: false; reason: 'forbidden' | 'not-found' | 'no-secret-key' };

/**
 * The plugin's nodes through the viewer's eyes: what the viewer may not read is absent, what they may not
 * write is refused, and another source's nodes are neither.
 */
export interface PluginNodes {
  /** A node the viewer may read, or null: missing, unreadable, or not the plugin's. */
  read(id: string): Promise<PluginNode | null>;
  canWrite(id: string): Promise<boolean>;
  /** A collection's documents from the plugin's source that the viewer may read, in the collection's order. */
  members(collectionId: string): Promise<PluginNode[]>;
  /** The plugin's nodes of one type the viewer may read (or write, with `writable`) whose title holds `q`. */
  search(type: 'collection' | 'document', q: string, opts?: { writable?: boolean; limit?: number }): Promise<PluginNode[]>;
  /**
   * Whether the viewer may make a node beside the page `pageId`. Ask before sending anything to the service on
   * their behalf, so a caller who may not learns nothing from it (whether a password was right).
   */
  mayCreateBeside(pageId: string): Promise<'ok' | 'forbidden' | 'not-found'>;
  /**
   * A collection backed by the source, in the namespace of `besidePageId` (which the viewer writes) and owned
   * by them, with `secret` sealed beside it. One each viewer reads with their own connection has no secret.
   */
  createCollection(input: { title: string; besidePageId: string; ref: Record<string, unknown>; secret?: string }): Promise<PluginWriteResult>;
  /**
   * A document backed by one of the source's files, made once however often it is asked for: `match`, never
   * empty, is the part of `ref` that identifies the file, and an existing node holding it is returned.
   * With `collectionId`, a member of a collection the viewer writes, holding the collection's credential;
   * with `besidePageId`, a document in the namespace of a page the viewer writes, with no credential (each
   * viewer reads it with their own connection).
   */
  createDocument(
    input: ({ collectionId: string; besidePageId?: never } | { besidePageId: string; collectionId?: never }) & {
      title: string;
      file: PluginFile;
      ref: Record<string, unknown>;
      match: Readonly<Record<string, string | number>>;
    }
  ): Promise<PluginWriteResult>;
  /** Replaces the record and, for a document, the file of a node the viewer writes (a new file chosen, a check asked for). */
  rebind(id: string, input: { ref: Record<string, unknown>; file?: PluginFile }): Promise<boolean>;
  /** Replaces a node's record with what the plugin observed while serving a reader; the viewer need only read it. */
  observe(id: string, ref: Record<string, unknown>): Promise<boolean>;
}

/** A node's credential for its source, sealed at rest (docs/architecture/authorization.md, "Secrets") and opened only here. */
export interface PluginSecrets {
  /** The credential of a node the viewer may read; null when it has none, or it no longer opens. */
  get(nodeId: string): Promise<string | null>;
  /** Seals a new credential for a node the viewer writes; false when it is not theirs to write or no key is configured. */
  set(nodeId: string, secret: string): Promise<boolean>;
}

/** A plugin's own facts sealed into a grant: a path, a file id. */
export type PluginGrantDetail = Readonly<Record<string, string | number>>;

/**
 * Short-lived sealed tokens that let this viewer, and no other, fetch a node's content: the viewer-neutral
 * address a page links redirects to one, and the plugin's file route redeems it.
 */
export interface PluginGrants {
  /**
   * A URL-safe token for a node the viewer may read, valid five minutes; null when they may not. `via: 'user'`
   * binds it to the viewer's own active connection (null without one), and it redeems with that alone.
   */
  issue(nodeId: string, detail: PluginGrantDetail, opts?: { via?: 'node' | 'user' }): Promise<string | null>;
  /**
   * What a token grants once its seal, time, viewer and the node's access check out: the node's own
   * credential (`via: 'node'`) or the viewer's connection, opened (`via: 'user'`). 'expired' past its time;
   * 'renew' when that connection is no longer the viewer's active one, never a fallback to the node's credential.
   */
  redeem(token: string): Promise<PluginRedeemed | 'expired' | 'renew' | null>;
}

/** What a redeemed grant reads with. */
export type PluginRedeemed =
  | { nodeId: string; detail: PluginGrantDetail; via: 'node' }
  | { nodeId: string; detail: PluginGrantDetail; via: 'user'; connection: PluginOpenConnection };

/** A connection opened for one request: its id (a grant names it), the account at the service, the credential. */
export interface PluginOpenConnection {
  id: string;
  accountId: string;
  /** The account's name as the service shows it: for the viewer's own eyes ("read as …"), never stored elsewhere. */
  accountLabel: string;
  credential: PluginCredential;
}

/** The viewer's connection to the plugin's service (docs/architecture/plugins.md, "Connections"). */
export interface PluginViewerConnection {
  /** From the database alone: none (anonymous, a share link's viewer, never connected), active, or one to renew. */
  status(): Promise<'none' | 'active' | 'renew'>;
  /**
   * The viewer's active credential for the plugin's current origin; null when there is none, it was revoked,
   * it was made against another origin, or it no longer opens. Records the use, at most hourly.
   */
  open(): Promise<PluginOpenConnection | null>;
  /** The service refused it (a 401): the connection turns revoked, once, and the change is logged. Never retry. */
  refused(connectionId: string): Promise<void>;
  /** Where the viewer connects or renews, returning to `returnTo` (a path on this app; by default the page being rendered). */
  href(returnTo?: string): string;
}

/** Responses under the rules the core keeps for its own routes. */
export interface PluginResponses {
  /** JSON for this viewer: never stored by a cache. */
  json(data: unknown, status?: number): Response;
  /**
   * A refusal, in the API's one error body (docs/architecture/routing.md, "Errors"): a code of the
   * plugin's or the core's, and the sentence for it — the core's own for one of its codes
   * when none is given.
   */
  error(status: number, code: string, message?: string): Response;
  /** A redirect to a path on this app (a grant's address): never cached, no referrer. */
  redirect(path: string): Response;
  /** A file passed on to the browser: nosniff, inline only for the types safe to show, sandboxed text and images, never cached. */
  file(input: { body: ReadableStream<Uint8Array>; mime: string; filename: string; size: number | null; download: boolean }): Response;
  /** The same answer whether it is missing or not the viewer's. */
  notFound(): Response;
  /** A grant past its time. */
  gone(): Response;
  /** A grant whose connection was renewed or removed. */
  forbidden(text?: string): Response;
}

/** The plugin's log lines (docs/architecture/logging.md, "Security"): by node id and operation, never by address. */
export interface PluginLog {
  upstreamFailed(fields: { operation: string; failure: string; status?: number; durationMs: number }): void;
  sourceState(fields: { nodeId: string; from: string | null; to: string; reason?: string }): void;
}

/** What the core hands a plugin's server half per request. */
export interface PluginHost {
  readonly pluginId: string;
  /** The signed-in user's id; null for an anonymous visitor and for every share link's viewer. */
  readonly viewerId: string | null;
  /** The interface language, for texts in a response. */
  readonly locale: string;
  settings(): Promise<PluginSettings>;
  /** The plugin's one way to the network; null while it is turned off or has no origin. */
  upstream(): Promise<PluginUpstream | null>;
  readonly nodes: PluginNodes;
  readonly secrets: PluginSecrets;
  readonly connection: PluginViewerConnection;
  readonly grants: PluginGrants;
  readonly respond: PluginResponses;
  readonly log: PluginLog;
}

// --- texts --------------------------------------------------------------------

/**
 * The language texts speak now, and what a plugin formats numbers and dates in: the content's during a
 * page render (docs/architecture/languages.md), the interface's everywhere else.
 */
export function currentLocale(): string {
  return getLocale();
}

type Params = Readonly<Record<string, string | number>>;

/** A plugin's interface texts: `t(key, params)` in the current language, `t.in(locale, …)` in a given one. */
export interface PluginTexts<K extends string> {
  (key: K, params?: Params): string;
  /** For a text rendered into content, which speaks the content's language. */
  in(locale: string, key: K, params?: Params): string;
}

/**
 * A plugin's own dictionaries, so the core's catalogues never carry its words: the base language's, then every
 * other, each with every key of the base (the compiler checks). `{name}` takes the param of that name; a
 * missing key or a language the app does not speak falls back to the base.
 */
export function pluginMessages<const D extends Readonly<Record<string, string>>>(
  base: D,
  translations: { readonly [L in Exclude<Locale, typeof baseLocale>]: { readonly [K in keyof D]: string } }
): PluginTexts<keyof D & string> {
  const byLocale: Readonly<Record<string, Readonly<Record<string, string>>>> = { ...translations, [baseLocale]: base };
  const format = (text: string, params?: Params) =>
    params ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole)) : text;
  const lookup = (locale: string, key: keyof D & string, params?: Params) => format(byLocale[locale]?.[key] ?? base[key], params);
  const t = ((key: keyof D & string, params?: Params) => lookup(getLocale(), key, params)) as PluginTexts<keyof D & string>;
  t.in = lookup;
  return t;
}
