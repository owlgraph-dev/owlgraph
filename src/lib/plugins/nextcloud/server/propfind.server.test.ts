// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { parseMultistatus, searchBody } from './propfind.server';
import type { DavRoot } from './davRoot';

const TOKEN = 'AbC123xyz';
const ROOT: DavRoot = { kind: 'share', token: TOKEN };
const base = `/public.php/dav/files/${TOKEN}`;

const folder = (href: string, extra = '') => `
  <d:response>
    <d:href>${href}</d:href>
    <d:propstat>
      <d:prop><d:resourcetype><d:collection/></d:resourcetype><d:getetag>"f1"</d:getetag><oc:fileid>10</oc:fileid><oc:size>2048</oc:size>${extra}</d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
    <d:propstat><d:prop><d:getcontentlength/><d:getcontenttype/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>
  </d:response>`;

const file = (href: string, props = '') => `
  <d:response>
    <d:href>${href}</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype/>
        <d:getcontentlength>1234</d:getcontentlength>
        <d:getcontenttype>application/pdf</d:getcontenttype>
        <d:getlastmodified>Fri, 02 Oct 2026 09:30:00 GMT</d:getlastmodified>
        <d:getetag>"e1"</d:getetag>
        <oc:fileid>48213</oc:fileid>${props}
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>`;

const multistatus = (body: string) =>
  `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">${body}</d:multistatus>`;

describe('a multistatus answer', () => {
  it('lists the folder first, then what is in it, with their properties', () => {
    const parsed = parseMultistatus(
      multistatus(folder(`${base}/`, '<d:displayname>Projektunterlagen</d:displayname>') + file(`${base}/Bericht%202026.pdf`) + folder(`${base}/Q3/`)),
      ROOT
    );
    expect(parsed?.tooMany).toBe(false);
    expect(parsed?.entries).toEqual([
      { path: '', name: 'Projektunterlagen', folder: true, size: 2048, mime: null, modified: null, etag: '"f1"', fileid: '10' },
      { path: 'Bericht 2026.pdf', name: 'Bericht 2026.pdf', folder: false, size: 1234, mime: 'application/pdf', modified: '2026-10-02T09:30:00.000Z', etag: '"e1"', fileid: '48213' },
      { path: 'Q3', name: 'Q3', folder: true, size: 2048, mime: null, modified: null, etag: '"f1"', fileid: '10' },
    ]);
  });

  it('resolves namespaces, whatever the prefixes', () => {
    const xml = `<?xml version="1.0"?>
      <multistatus xmlns="DAV:" xmlns:o="http://owncloud.org/ns">
        <response><href>${base}/a.txt</href><propstat><prop><resourcetype/><getcontentlength>3</getcontentlength><getcontenttype>text/plain</getcontenttype><o:fileid>7</o:fileid></prop><status>HTTP/1.1 200 OK</status></propstat></response>
      </multistatus>`;
    expect(parseMultistatus(xml, ROOT)?.entries).toEqual([
      { path: 'a.txt', name: 'a.txt', folder: false, size: 3, mime: 'text/plain', modified: null, etag: null, fileid: '7' },
    ]);
    const upper = `<?xml version="1.0"?><D:multistatus xmlns:D="DAV:"><D:response><D:href>${base}/b.txt</D:href><D:propstat><D:prop><D:getcontentlength>4</D:getcontentlength></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>`;
    expect(parseMultistatus(upper, ROOT)?.entries.map((e) => [e.path, e.size])).toEqual([['b.txt', 4]]);
  });

  it('does not take an element of another namespace for a DAV one', () => {
    const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:x="urn:other">
      <d:response><d:href>${base}/a.txt</d:href><d:propstat><d:prop><x:getcontentlength>999</x:getcontentlength><d:getcontentlength>3</d:getcontentlength></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
    </d:multistatus>`;
    expect(parseMultistatus(xml, ROOT)?.entries[0].size).toBe(3);
  });

  it('takes only what a successful propstat reports', () => {
    const xml = multistatus(`
      <d:response><d:href>${base}/a.pdf</d:href>
        <d:propstat><d:prop><d:getcontentlength>5</d:getcontentlength></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
        <d:propstat><d:prop><d:getcontenttype>text/html</d:getcontenttype></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>
      </d:response>
      <d:response><d:href>${base}/gone.pdf</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>`);
    expect(parseMultistatus(xml, ROOT)?.entries).toEqual([{ path: 'a.pdf', name: 'a.pdf', folder: false, size: 5, mime: null, modified: null, etag: null, fileid: null }]);
  });

  it('drops a response whose href lies outside the share', () => {
    const xml = multistatus(file(`${base}/ok.pdf`) + file('/public.php/dav/files/OtherShare/secret.pdf') + file('/remote.php/dav/files/admin/x.pdf') + file(`${base}/../OtherShare/y.pdf`));
    expect(parseMultistatus(xml, ROOT)?.entries.map((e) => e.path)).toEqual(['ok.pdf']);
  });

  it('decodes entities and keeps text as text', () => {
    const xml = multistatus(file(`${base}/R%26D.pdf`, '').replace('application/pdf', 'application/pdf'));
    expect(parseMultistatus(xml.replace(`${base}/R%26D.pdf`, `${base}/R&amp;D%20%3Cb%3E.pdf`), ROOT)?.entries[0].name).toBe('R&D <b>.pdf');
  });

  it('is too large past the entry limit', () => {
    const body = folder(`${base}/`) + Array.from({ length: 6 }, (_, i) => file(`${base}/f${i}.pdf`)).join('');
    expect(parseMultistatus(multistatus(body), ROOT, { maxEntries: 5 })?.tooMany).toBe(true);
    expect(parseMultistatus(multistatus(body), ROOT, { maxEntries: 6 })?.tooMany).toBe(false);
  });

  it('is null when it is no multistatus at all', () => {
    for (const body of ['', 'not xml', '<html><body>Login</body></html>', '<?xml version="1.0"?><d:error xmlns:d="DAV:"/>', '<multistatus><response/></multistatus>']) {
      expect(parseMultistatus(body, ROOT), body).toBeNull();
    }
  });

  it('reads an answer nested past any multistatus as none, quickly', () => {
    const deep = multistatus(`<d:response>${'<d:x>'.repeat(100_000)}${'</d:x>'.repeat(100_000)}</d:response>`);
    const started = performance.now();
    expect(parseMultistatus(deep, ROOT)).toBeNull();
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('reads an answer declaring namespaces past any multistatus as none, quickly', () => {
    const declarations = Array.from({ length: 20_000 }, (_, i) => `xmlns:n${i}="urn:n${i}"`).join(' ');
    const nested = `<d:multistatus xmlns:d="DAV:" ${declarations}>${'<d:a>'.repeat(60)}${'</d:a>'.repeat(60)}${folder(`${base}/`)}</d:multistatus>`;
    const started = performance.now();
    expect(parseMultistatus(nested, ROOT)).toBeNull();
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('keeps reading an ordinary answer whose elements declare their own namespaces', () => {
    const body = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response xmlns:oc="http://owncloud.org/ns"><d:href>${base}/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype><oc:fileid>10</oc:fileid></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`;
    expect(parseMultistatus(body, ROOT)?.entries.map((e) => [e.path, e.fileid])).toEqual([['', '10']]);
  });

  it("never expands a DOCTYPE's entities", () => {
    const body = `<?xml version="1.0"?><!DOCTYPE m [<!ENTITY a "AAAAAAAAAA"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]>${multistatus(file(`${base}/&b;.pdf`))}`;
    const parsed = parseMultistatus(body, ROOT);
    expect(JSON.stringify(parsed)).not.toContain('AAAAAAAAAA');
  });

  it('survives a malformed one without inventing entries', () => {
    const truncated = multistatus(file(`${base}/a.pdf`)).slice(0, 200);
    const parsed = parseMultistatus(truncated, ROOT);
    expect(parsed === null || parsed.entries.every((e) => e.path === 'a.pdf')).toBe(true);
  });
});

describe("a search of a person's own files", () => {
  const ALICE: DavRoot = { kind: 'user', uid: 'alice' };
  const own = '/remote.php/dav/files/alice';

  it('asks for the one entry with a file id, in their whole tree', () => {
    const body = searchBody('alice', '500');
    expect(body).toContain('<d:href>/files/alice</d:href>');
    expect(body).toContain('<d:depth>infinity</d:depth>');
    expect(body).toMatch(/<d:eq>\s*<d:prop><oc:fileid\/><\/d:prop>\s*<d:literal>500<\/d:literal>/);
    expect(() => searchBody('alice', '5 or 1')).toThrow();
    expect(() => searchBody('../bob', '500')).toThrow();
  });

  it('reads its answer as paths in their own files — none of anyone else', () => {
    const parsed = parseMultistatus(multistatus(folder(`${own}/Projekte/Team%20(Alice)/`) + file('/remote.php/dav/files/bob/Team/a.pdf')), ALICE);
    expect(parsed?.entries.map((e) => [e.path, e.folder, e.fileid])).toEqual([['Projekte/Team (Alice)', true, '10']]);
  });
});
