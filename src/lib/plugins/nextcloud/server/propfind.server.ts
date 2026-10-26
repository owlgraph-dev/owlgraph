// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// PROPFIND (RFC 4918) and SEARCH (RFC 5323, as Nextcloud answers it). The 207
// answer is parsed with namespaces resolved (a server may name DAV: `d:`, `D:`
// or the default), and a response whose href lies outside the root asked of is
// dropped: a path from the answer is only believed inside that root.
import { Parser } from 'htmlparser2';
import { nameOf } from '../sharePath';
import { pathOfHref, searchScope, type DavRoot } from './davRoot';

const DAV = 'DAV:';
const OC = 'http://owncloud.org/ns';

export const PROPFIND_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
    <d:getcontentlength/>
    <d:getcontenttype/>
    <d:getlastmodified/>
    <d:getetag/>
    <oc:fileid/>
    <oc:size/>
  </d:prop>
</d:propfind>`;

/** Finds the entry with this file id among the files a person owns or was shared. */
export function searchBody(uid: string, fileid: string): string {
  if (!/^\d{1,20}$/.test(fileid)) throw new Error('searchBody: not a file id');
  return `<?xml version="1.0" encoding="UTF-8"?>
<d:searchrequest xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
  <d:basicsearch>
    <d:select>
      <d:prop>
        <d:displayname/>
        <d:resourcetype/>
        <d:getcontentlength/>
        <d:getcontenttype/>
        <d:getlastmodified/>
        <d:getetag/>
        <oc:fileid/>
        <oc:size/>
      </d:prop>
    </d:select>
    <d:from>
      <d:scope>
        <d:href>${searchScope(uid)}</d:href>
        <d:depth>infinity</d:depth>
      </d:scope>
    </d:from>
    <d:where>
      <d:eq>
        <d:prop><oc:fileid/></d:prop>
        <d:literal>${fileid}</d:literal>
      </d:eq>
    </d:where>
    <d:orderby/>
  </d:basicsearch>
</d:searchrequest>`;
}

export interface DavEntry {
  /** Inside the root asked of; '' for the root. */
  path: string;
  /** For the root, the share's own name when the server gives it. */
  name: string;
  folder: boolean;
  size: number | null;
  mime: string | null;
  modified: string | null;
  etag: string | null;
  /** The server's id of the file: what survives a rename. */
  fileid: string | null;
}

/** A Depth 1 answer holds the folder and at most this many entries in it; more is too large to list. */
const MAX_ENTRIES = 2000;

// Caps on a hostile answer: one nested deeper or declaring more namespaces is
// malformed, refused in linear time rather than left to cost quadratically.
const MAX_DEPTH = 64;
const MAX_NAMESPACE_DECLARATIONS = 256;

type Props = Partial<Record<'displayname' | 'getcontentlength' | 'getcontenttype' | 'getlastmodified' | 'getetag' | 'fileid' | 'size', string>> & {
  collection?: boolean;
};

interface Element {
  uri: string;
  local: string;
  ns: ReadonlyMap<string, string>;
}

const PROP_NAMES: Readonly<Record<string, readonly string[]>> = {
  [DAV]: ['displayname', 'getcontentlength', 'getcontenttype', 'getlastmodified', 'getetag'],
  [OC]: ['fileid', 'size'],
};

const number = (text: string | undefined): number | null => {
  if (text === undefined || !/^\d{1,16}$/.test(text.trim())) return null;
  return Number(text.trim());
};

const isoTime = (text: string | undefined): string | null => {
  if (!text) return null;
  const time = new Date(text.trim());
  return Number.isNaN(time.getTime()) ? null : time.toISOString();
};

/**
 * Entries in the server's order, the asked folder first. Responses outside the
 * root or without a 200 propstat are dropped; null when not a multistatus.
 */
export function parseMultistatus(xml: string, root: DavRoot, opts: { maxEntries?: number } = {}): { entries: DavEntry[]; tooMany: boolean } | null {
  const maxEntries = opts.maxEntries ?? MAX_ENTRIES;
  const entries: DavEntry[] = [];
  let tooMany = false;
  let isMultistatus = false;
  let hostile = false;
  let declarations = 0;

  const stack: Element[] = [];
  let href: string | null = null;
  let props: Props = {};
  let propstat: { props: Props; status: string } | null = null;
  let text: string | null = null;

  const inside = (uri: string, local: string) => stack.some((e) => e.uri === uri && e.local === local);
  // Stop the parser: it searches its own stack of open tags on every close, so
  // reading on would cost what the caps save.
  const refuse = () => {
    hostile = true;
    parser.pause();
  };
  const parent = () => stack[stack.length - 2];

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (hostile) return;
        if (stack.length >= MAX_DEPTH) {
          refuse();
          return;
        }
        // The parent's namespaces, copied only for an element that declares its own.
        const inherited: ReadonlyMap<string, string> = stack.length ? stack[stack.length - 1].ns : new Map();
        let ns = inherited;
        for (const [attr, value] of Object.entries(attribs)) {
          if (attr !== 'xmlns' && !attr.startsWith('xmlns:')) continue;
          if (++declarations > MAX_NAMESPACE_DECLARATIONS) {
            refuse();
            return;
          }
          if (ns === inherited) ns = new Map(inherited);
          (ns as Map<string, string>).set(attr === 'xmlns' ? '' : attr.slice(6), value);
        }
        const colon = name.indexOf(':');
        const prefix = colon === -1 ? '' : name.slice(0, colon);
        const local = colon === -1 ? name : name.slice(colon + 1);
        const element = { uri: ns.get(prefix) ?? '', local, ns };
        stack.push(element);

        if (stack.length === 1) isMultistatus = element.uri === DAV && local === 'multistatus';
        if (!isMultistatus || tooMany) return;
        if (element.uri === DAV && local === 'response') {
          href = null;
          props = {};
        } else if (element.uri === DAV && local === 'propstat' && inside(DAV, 'response')) {
          propstat = { props: {}, status: '' };
        } else if (element.uri === DAV && (local === 'href' || local === 'status')) {
          text = '';
        } else if (propstat && parent()?.uri === DAV && parent()?.local === 'prop' && PROP_NAMES[element.uri]?.includes(local)) {
          text = '';
        } else if (propstat && element.uri === DAV && local === 'collection' && parent()?.local === 'resourcetype') {
          propstat.props.collection = true;
        }
      },
      ontext(data) {
        if (text !== null && !hostile) text += data;
      },
      onclosetag() {
        if (hostile) return;
        const element = stack.pop();
        if (!element || !isMultistatus || tooMany) return;
        const { uri, local } = element;
        if (uri === DAV && local === 'href' && text !== null && !propstat) {
          href = text.trim();
        } else if (uri === DAV && local === 'status' && text !== null && propstat) {
          propstat.status = text.trim();
        } else if (propstat && text !== null && PROP_NAMES[uri]?.includes(local)) {
          (propstat.props as Record<string, string>)[local] = text;
        } else if (uri === DAV && local === 'propstat' && propstat) {
          // Only what the server found: a 404 propstat lists what it lacks.
          if (/^HTTP\/\d(?:\.\d)?\s+200\b/.test(propstat.status)) props = { ...props, ...propstat.props };
          propstat = null;
        } else if (uri === DAV && local === 'response') {
          const path = href === null ? null : pathOfHref(href, root);
          if (path !== null && Object.keys(props).length > 0) {
            if (entries.length > maxEntries) tooMany = true;
            else entries.push(entryOf(path, props));
          }
          href = null;
        }
        if (!(uri === DAV && local === 'response')) text = null;
      },
    },
    { xmlMode: true, decodeEntities: true }
  );
  parser.write(xml);
  if (!hostile) parser.end();
  if (!isMultistatus || hostile) return null;
  return { entries: tooMany ? entries.slice(0, maxEntries + 1) : entries, tooMany };
}

function entryOf(path: string, props: Props): DavEntry {
  const folder = props.collection === true;
  const displayName = props.displayname?.trim();
  return {
    path,
    name: path === '' ? (displayName ?? '') : nameOf(path),
    folder,
    size: number(props.getcontentlength) ?? number(props.size),
    mime: folder ? null : (props.getcontenttype?.trim() || null),
    modified: isoTime(props.getlastmodified),
    etag: props.getetag?.trim() || null,
    fileid: props.fileid?.trim() || null,
  };
}
