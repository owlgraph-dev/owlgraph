// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A stand-in Nextcloud on 127.0.0.1 (docs/guides/testing.md, "Stand-ins for other
// services"): status, public shares, Login Flow v2, OCS, and users' own trees.
// A share received lies in the receiver's tree under the owner's file ids.
// Every request is recorded with its credential's user, so a test can assert
// what was sent and as whom.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';

export interface MockFile {
  content: string | Buffer;
  mime: string;
  fileid: number;
  modified?: Date;
}

export interface MockShare {
  /** The root's display name. */
  name: string;
  /** By path inside the share; their folders exist with them. */
  files: Record<string, MockFile>;
  /** Empty folders. */
  folders?: string[];
  password?: string;
  /** Every request is a 404. */
  revoked?: boolean;
  /** By path ('' for the root). */
  folderIds?: Record<string, number>;
}

export interface MockUser {
  /** What Basic auth names; may differ from the uid. */
  loginName: string;
  displayName: string;
  /** `name` unused. */
  tree: MockShare;
  /** Paths their permissions keep from them, and everything below. */
  hidden?: string[];
  /** Present but not found by SEARCH, like storage Nextcloud does not index. */
  unsearchable?: string[];
}

export interface MockRequest {
  method: string;
  path: string;
  depth: string | null;
  authorization: string | null;
  requestedWith: string | null;
  /** The app password's uid, 'anonymous' on a public share, else null. */
  authUser: string | null;
  userAgent: string | null;
}

interface Flow {
  loginToken: string;
  pollToken: string;
  userAgent: string;
  approvedBy: string | null;
  appPassword: string | null;
}

export interface MockNextcloud {
  readonly origin: string;
  readonly shares: Map<string, MockShare>;
  readonly users: Map<string, MockUser>;
  /** Password → uid; deleting one revokes it. */
  readonly appPasswords: Map<string, string>;
  /** `down` drops every connection, `redirect` answers 302 elsewhere, `error` 503. */
  mode: 'ok' | 'down' | 'redirect' | 'error';
  /** Holds every answer back after recording it, on the global `setTimeout` so fake timers reach it. */
  delayMs: number;
  version: string;
  /** What an approved poll reports as `server`; null for this origin. */
  flowServer: string | null;
  readonly requests: MockRequest[];
  /** What the approval page's button does; returns the minted app password. */
  approve(loginToken: string, uid: string): string | null;
  revokeAppPasswords(uid: string): void;
  close(): Promise<void>;
}

const PUBLIC = '/public.php/dav/files/';
const PRIVATE = '/remote.php/dav/files/';
const BASE_TIME = new Date('2026-10-02T09:30:00Z');
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
const token = (length: number) => [...randomBytes(length)].map((b) => ALNUM[b % ALNUM.length]).join('');

function foldersOf(tree: MockShare): Set<string> {
  const folders = new Set<string>(['']);
  for (const path of [...Object.keys(tree.files), ...(tree.folders ?? [])]) {
    const segments = path.split('/');
    const upTo = tree.files[path] ? segments.length - 1 : segments.length;
    for (let i = 1; i <= upTo; i++) folders.add(segments.slice(0, i).join('/'));
  }
  return folders;
}

function folderId(tree: MockShare, path: string): number {
  return tree.folderIds?.[path] ?? 9000 + [...path].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 900, 0);
}

function etagOf(file: MockFile): string {
  return `"${file.fileid}-${Buffer.byteLength(file.content)}-${(file.modified ?? BASE_TIME).getTime()}"`;
}

/** What one viewer of a tree may see of it. */
interface View {
  tree: MockShare;
  visible(path: string): boolean;
  /** The root's href prefix. */
  prefix: string;
  rootName: string;
}

function folderEtag(view: View, folder: string): string {
  const inside = Object.entries(view.tree.files)
    .filter(([p]) => view.visible(p) && (folder === '' || p.startsWith(`${folder}/`)))
    .map(([p, f]) => `${p}:${etagOf(f)}`)
    .sort()
    .join('|');
  let hash = 0;
  for (const c of inside) hash = (hash * 33 + c.charCodeAt(0)) >>> 0;
  return `"f${hash.toString(16)}"`;
}

function response(view: View, path: string): string {
  const href = `${view.prefix}${path === '' ? '' : encodePath(path)}`;
  const file = view.tree.files[path];
  if (file) {
    return `<d:response><d:href>${xmlEscape(href)}</d:href><d:propstat><d:prop>
<d:resourcetype/><d:getcontentlength>${Buffer.byteLength(file.content)}</d:getcontentlength>
<d:getcontenttype>${xmlEscape(file.mime)}</d:getcontenttype>
<d:getlastmodified>${(file.modified ?? BASE_TIME).toUTCString()}</d:getlastmodified>
<d:getetag>${xmlEscape(etagOf(file))}</d:getetag><oc:fileid>${file.fileid}</oc:fileid><oc:size>${Buffer.byteLength(file.content)}</oc:size>
</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
<d:propstat><d:prop><d:displayname/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat></d:response>`;
  }
  const size = Object.entries(view.tree.files)
    .filter(([p]) => view.visible(p) && (path === '' || p.startsWith(`${path}/`)))
    .reduce((sum, [, f]) => sum + Buffer.byteLength(f.content), 0);
  return `<d:response><d:href>${xmlEscape(href.endsWith('/') ? href : `${href}/`)}</d:href><d:propstat><d:prop>
${path === '' ? `<d:displayname>${xmlEscape(view.rootName)}</d:displayname>` : ''}
<d:resourcetype><d:collection/></d:resourcetype><d:getlastmodified>${BASE_TIME.toUTCString()}</d:getlastmodified>
<d:getetag>${xmlEscape(folderEtag(view, path))}</d:getetag><oc:fileid>${folderId(view.tree, path)}</oc:fileid><oc:size>${size}</oc:size>
</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
<d:propstat><d:prop><d:getcontentlength/><d:getcontenttype/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat></d:response>`;
}

function childrenOf(view: View, folder: string, folders: Set<string>): string[] {
  const depth = folder === '' ? 1 : folder.split('/').length + 1;
  const within = (p: string) => (folder === '' || p.startsWith(`${folder}/`)) && p.split('/').length === depth;
  return [...[...folders].filter((p) => p !== '' && within(p)), ...Object.keys(view.tree.files).filter(within)].filter((p) => view.visible(p)).sort();
}

const multistatus = (parts: string[]) =>
  `<?xml version="1.0"?>\n<d:multistatus xmlns:d="DAV:" xmlns:s="http://sabredav.org/ns" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">${parts.join('')}</d:multistatus>`;

const ocs = (statuscode: number, data: unknown) => JSON.stringify({ ocs: { meta: { status: statuscode < 300 ? 'ok' : 'failure', statuscode, message: 'OK' }, data } });

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}

export async function startMockNextcloud(shares: Record<string, MockShare> = {}, users: Record<string, MockUser> = {}): Promise<MockNextcloud> {
  const requests: MockRequest[] = [];
  const state = { mode: 'ok' as MockNextcloud['mode'], delayMs: 0, version: '29.0.3.2', flowServer: null as string | null };
  const shareMap = new Map(Object.entries(shares));
  const userMap = new Map(Object.entries(users));
  const appPasswords = new Map<string, string>();
  const flows: Flow[] = [];
  let origin = '';

  /** The uid an app password authenticates as, if the login name matches. */
  function appUser(authorization: string | undefined): string | null {
    if (!authorization?.startsWith('Basic ')) return null;
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    if (colon < 0) return null;
    const uid = appPasswords.get(decoded.slice(colon + 1));
    return uid && userMap.get(uid)?.loginName === decoded.slice(0, colon) ? uid : null;
  }

  function approve(loginToken: string, uid: string): string | null {
    const flow = flows.find((f) => f.loginToken === loginToken);
    if (!flow || flow.approvedBy || !userMap.has(uid)) return null;
    flow.approvedBy = uid;
    flow.appPassword = token(72);
    appPasswords.set(flow.appPassword, uid);
    return flow.appPassword;
  }

  const notFound = (res: ServerResponse): void => void res.writeHead(404, { 'content-type': 'application/xml' }).end('<?xml version="1.0"?><d:error xmlns:d="DAV:"/>');
  const unauthorized = (res: ServerResponse): void => void res.writeHead(401, { 'www-authenticate': 'Basic realm="Nextcloud", charset="UTF-8"' }).end();

  function dav(req: IncomingMessage, res: ServerResponse, view: View, path: string): void {
    const folders = foldersOf(view.tree);
    const file = view.tree.files[path];
    if ((!file && !folders.has(path)) || !view.visible(path)) return notFound(res);
    if (req.method === 'PROPFIND') {
      const depth = req.headers.depth === '0' ? 0 : 1;
      const paths = file || depth === 0 ? [path] : [path, ...childrenOf(view, path, folders)];
      res.writeHead(207, { 'content-type': 'application/xml; charset=utf-8' }).end(multistatus(paths.map((p) => response(view, p))));
      return;
    }
    if (req.method === 'GET' && file) {
      const bytes = Buffer.from(file.content);
      res.writeHead(200, { 'content-type': file.mime, 'content-length': String(bytes.length), etag: etagOf(file) }).end(bytes);
      return;
    }
    res.writeHead(405).end();
  }

  function userView(uid: string): View {
    const user = userMap.get(uid)!;
    const hidden = user.hidden ?? [];
    return {
      tree: user.tree,
      visible: (p) => !hidden.some((h) => p === h || p.startsWith(`${h}/`)),
      prefix: `${PRIVATE}${uid}/`,
      rootName: uid,
    };
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://mock.local');
    const body = await readBody(req);
    const authUser = appUser(req.headers.authorization);
    requests.push({
      method: req.method ?? '',
      path: url.pathname,
      depth: req.headers.depth?.toString() ?? null,
      authorization: req.headers.authorization ?? null,
      requestedWith: req.headers['x-requested-with']?.toString() ?? null,
      authUser: authUser ?? (url.pathname.startsWith(PUBLIC) ? 'anonymous' : null),
      userAgent: req.headers['user-agent']?.toString() ?? null,
    });
    if (state.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, state.delayMs));
    if (state.mode === 'down') {
      req.socket.destroy();
      return;
    }
    if (state.mode === 'redirect') {
      res.writeHead(302, { location: 'https://elsewhere.example/login' }).end();
      return;
    }
    if (state.mode === 'error') {
      res.writeHead(503, { 'content-type': 'text/plain' }).end('Service unavailable');
      return;
    }
    const route = url.pathname.replace(/^\/index\.php(?=\/)/, '');

    if (route === '/status.php' && req.method === 'GET') {
      const versionstring = state.version.split('.').slice(0, 3).join('.');
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({ installed: true, maintenance: false, needsDbUpgrade: false, version: state.version, versionstring, edition: '', productname: 'Nextcloud', extendedSupport: false })
      );
      return;
    }

    if (route === '/login/v2' && req.method === 'POST') {
      const flow: Flow = { loginToken: token(32), pollToken: token(128), userAgent: req.headers['user-agent']?.toString() ?? '', approvedBy: null, appPassword: null };
      flows.push(flow);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ poll: { token: flow.pollToken, endpoint: `${origin}/index.php/login/v2/poll` }, login: `${origin}/index.php/login/v2/flow/${flow.loginToken}` }));
      return;
    }
    const landing = /^\/login\/v2\/flow\/([A-Za-z0-9]+)$/.exec(route);
    if (landing && req.method === 'GET') {
      const flow = flows.find((f) => f.loginToken === landing[1]);
      if (!flow) {
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><title>Nextcloud</title><p>Ungültiger Link.</p>');
        return;
      }
      const buttons = [...userMap.entries()]
        .map(([uid, u]) => `<form method="post" action="/index.php/login/v2/grant"><input type="hidden" name="token" value="${flow.loginToken}"><input type="hidden" name="user" value="${xmlEscape(uid)}"><button type="submit">Zugriff gewähren als ${xmlEscape(u.displayName)}</button></form>`)
        .join('');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><title>Nextcloud – Konto verbinden</title><h1>${xmlEscape(flow.userAgent)} möchte auf dein Konto zugreifen</h1>${buttons}`);
      return;
    }
    if (route === '/login/v2/grant' && req.method === 'POST') {
      const form = new URLSearchParams(body);
      const ok = approve(form.get('token') ?? '', form.get('user') ?? '') !== null;
      res.writeHead(ok ? 200 : 403, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><title>Nextcloud</title><p>${ok ? 'Konto verbunden. Du kannst dieses Fenster schließen.' : 'Abgelehnt.'}</p>`);
      return;
    }
    if (route === '/login/v2/poll' && req.method === 'POST') {
      const pollToken = new URLSearchParams(body).get('token') ?? '';
      const index = flows.findIndex((f) => f.pollToken === pollToken);
      const flow = index < 0 ? null : flows[index];
      if (!flow || !flow.approvedBy || !flow.appPassword) {
        res.writeHead(404, { 'content-type': 'application/json' }).end('[]');
        return;
      }
      // The credential is handed out once.
      flows.splice(index, 1);
      const user = userMap.get(flow.approvedBy)!;
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ server: state.flowServer ?? origin, loginName: user.loginName, appPassword: flow.appPassword }));
      return;
    }

    if (route.startsWith('/ocs/') && req.headers['ocs-apirequest'] !== 'true') return unauthorized(res);
    if (route === '/ocs/v1.php/cloud/user' && req.method === 'GET') {
      if (!authUser) return unauthorized(res);
      const user = userMap.get(authUser)!;
      res.writeHead(200, { 'content-type': 'application/json' }).end(ocs(100, { id: authUser, 'display-name': user.displayName, displayname: user.displayName }));
      return;
    }
    if (route === '/ocs/v2.php/core/apppassword' && req.method === 'DELETE') {
      if (!authUser) return unauthorized(res);
      const decoded = Buffer.from(req.headers.authorization!.slice(6), 'base64').toString('utf8');
      appPasswords.delete(decoded.slice(decoded.indexOf(':') + 1));
      res.writeHead(200, { 'content-type': 'application/json' }).end(ocs(200, []));
      return;
    }

    if (route === '/remote.php/dav/' && req.method === 'SEARCH') {
      if (!authUser) return unauthorized(res);
      const scope = /<d:href>\s*\/files\/([^<\s]+?)\/?\s*<\/d:href>/.exec(body)?.[1];
      const fileid = /<oc:fileid\s*\/>\s*<\/d:prop>\s*<d:literal>\s*(\d+)\s*<\/d:literal>/.exec(body)?.[1];
      if (!scope || decodeURIComponent(scope) !== authUser) {
        res.writeHead(403).end();
        return;
      }
      const view = userView(authUser);
      const id = Number(fileid);
      const folders = foldersOf(view.tree);
      const unsearchable = userMap.get(authUser)!.unsearchable ?? [];
      const found = [
        ...Object.entries(view.tree.files).filter(([, f]) => f.fileid === id).map(([p]) => p),
        ...[...folders].filter((p) => folderId(view.tree, p) === id),
      ].filter((p) => view.visible(p) && !unsearchable.some((u) => p === u || p.startsWith(`${u}/`)));
      res.writeHead(207, { 'content-type': 'application/xml; charset=utf-8' }).end(multistatus(found.map((p) => response(view, p))));
      return;
    }
    if (route.startsWith(PRIVATE)) {
      const [uid, ...rest] = route.slice(PRIVATE.length).split('/');
      if (!authUser || decodeURIComponent(uid) !== authUser) return unauthorized(res);
      let path: string;
      try {
        path = rest.filter((s) => s !== '').map(decodeURIComponent).join('/');
      } catch {
        res.writeHead(400).end();
        return;
      }
      return dav(req, res, userView(authUser), path);
    }

    if (!route.startsWith(PUBLIC)) {
      res.writeHead(404).end();
      return;
    }
    const [shareToken, ...rest] = route.slice(PUBLIC.length).split('/');
    const share = shareMap.get(shareToken);
    if (!share || share.revoked) return notFound(res);
    if (share.password !== undefined) {
      const expected = `Basic ${Buffer.from(`anonymous:${share.password}`).toString('base64')}`;
      if (req.headers.authorization !== expected) return unauthorized(res);
    }
    // Nextcloud's CSRF check: a public non-GET not marked as an XHR is a 401.
    if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'XMLHttpRequest') return unauthorized(res);
    let path: string;
    try {
      path = rest.filter((s) => s !== '').map(decodeURIComponent).join('/');
    } catch {
      res.writeHead(400).end();
      return;
    }
    dav(req, res, { tree: share, visible: () => true, prefix: `${PUBLIC}${shareToken}/`, rootName: share.name }, path);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${port}`;
  return {
    origin,
    shares: shareMap,
    users: userMap,
    appPasswords,
    get mode() {
      return state.mode;
    },
    set mode(mode) {
      state.mode = mode;
    },
    get delayMs() {
      return state.delayMs;
    },
    set delayMs(ms) {
      state.delayMs = ms;
    },
    get version() {
      return state.version;
    },
    set version(version) {
      state.version = version;
    },
    get flowServer() {
      return state.flowServer;
    },
    set flowServer(server) {
      state.flowServer = server;
    },
    requests,
    approve,
    revokeAppPasswords(uid) {
      for (const [password, owner] of appPasswords) if (owner === uid) appPasswords.delete(password);
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
