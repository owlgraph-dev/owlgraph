// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { logEvent, loggerOptions, type EventFields } from './logger.server';

// Read from the lines a logger built from the real options writes, for every
// listed field wherever a slip would put one.

/** The fields the redaction lists, by what they would leak. */
const LISTED: Record<string, string[]> = {
  password: ['password', 'newPassword', 'currentPassword', 'passwordHash', 'password_hash', 'sharePassword', 'appPassword'],
  token: ['token', 'rawToken', 'sessionToken', 'apiToken', 'shareToken', 'pollToken'],
  email: ['email'],
  name: ['name', 'loginName'],
  'document body': ['doc', 'html', 'css', 'bytes', 'sample'],
  'sealed secret': ['secret', 'sealed', 'credential', 'handle', 'approveUrl'],
};
const REDACTED = '[redacted]';

function capture() {
  const lines: string[] = [];
  const log = pino({ ...loggerOptions, level: 'debug' }, { write: (line: string) => void lines.push(line) });
  const last = () => {
    const line = lines.at(-1);
    if (line === undefined) throw new Error('nothing was logged');
    return { raw: line, json: JSON.parse(line) as Record<string, unknown> };
  };
  return { log, last };
}

/** A value that is found in a line only if it was written: unique per field. */
const valueOf = (field: string) => `leak-${field}-7f3c9e`;

describe('a log line', () => {
  for (const [kind, fields] of Object.entries(LISTED)) {
    it(`writes [redacted] for a ${kind} at the top level, keeping the fields beside it`, () => {
      const { log, last } = capture();
      for (const field of fields) {
        log.info({ [field]: valueOf(field), userId: 'user-1', count: 3 }, 'probe');
        const { raw, json } = last();
        expect(json[field], field).toBe(REDACTED);
        expect(raw, field).not.toContain(valueOf(field));
        expect(json).toMatchObject({ userId: 'user-1', count: 3, event: 'probe' });
      }
    });

    it(`writes [redacted] for a ${kind} one level down, keeping the fields beside it`, () => {
      const { log, last } = capture();
      for (const field of fields) {
        log.info({ subject: { [field]: valueOf(field), id: 'subject-1' } }, 'probe');
        const { raw, json } = last();
        const subject = json.subject as Record<string, unknown>;
        expect(subject[field], field).toBe(REDACTED);
        expect(raw, field).not.toContain(valueOf(field));
        expect(subject.id).toBe('subject-1');
      }
    });
  }

  it('writes [redacted] for a request’s cookie and authorization headers and a response’s set-cookie, keeping the other headers', () => {
    const { log, last } = capture();
    log.info(
      {
        req: { method: 'GET', headers: { authorization: 'Bearer leak-bearer-7f3c9e', cookie: 'session=leak-cookie-7f3c9e', accept: 'text/html' } },
        res: { statusCode: 200, headers: { 'set-cookie': 'session=leak-set-cookie-7f3c9e; HttpOnly', 'content-type': 'text/html' } },
      },
      'probe'
    );
    const { raw, json } = last();
    expect(raw).not.toMatch(/leak-(bearer|cookie|set-cookie)-7f3c9e/);
    expect(json.req).toEqual({ method: 'GET', headers: { authorization: REDACTED, cookie: REDACTED, accept: 'text/html' } });
    expect(json.res).toEqual({ statusCode: 200, headers: { 'set-cookie': REDACTED, 'content-type': 'text/html' } });
  });

  it('writes [redacted] for what a child logger is bound to — a whole user bound by mistake keeps only its id', () => {
    const { log, last } = capture();
    const user = { id: 'user-1', email: 'leak-email@example.org', name: 'Leak Name', role: 'editor' };
    log.child({ reqId: 'req-1', user }).info('probe');
    const { raw, json } = last();
    expect(raw).not.toContain(user.email);
    expect(raw).not.toContain(user.name);
    expect(json.user).toEqual({ id: 'user-1', email: REDACTED, name: REDACTED, role: 'editor' });
    expect(json.reqId).toBe('req-1');
  });

  it('writes [redacted] for a listed field on a catalog event, which keeps its own fields', () => {
    const { log, last } = capture();
    // A field the event does not declare, slipped in beside the ones it does.
    const fields = { subjectId: 'user-1', actorId: 'admin-1', self: false, newPassword: 'leak-new-password-7f3c9e' };
    logEvent(log, 'user.password_changed', fields as EventFields['user.password_changed']);
    const { raw, json } = last();
    expect(raw).not.toContain(fields.newPassword);
    expect(json).toMatchObject({ event: 'user.password_changed', subjectId: 'user-1', actorId: 'admin-1', self: false, audit: true, newPassword: REDACTED });
  });

  it('keeps what is no secret as it is: ids, a truncated token hash, counts', () => {
    const { log, last } = capture();
    const fields = { userId: 'user-1', tokenHash: 'a1b2c3d4e5f6', nodeId: 'node-1', bytesTotal: 10, termLength: 4 };
    log.info({ ...fields, nested: { ...fields } }, 'probe');
    const { json } = last();
    expect(json).toMatchObject({ ...fields, nested: fields });
  });
});
