// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createServer as createHttpServer } from 'node:http';
import { createServer, type Server } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { secretKeyProblem } from '../../src/lib/platform/secretBox.server';
import { assertPortsFree, hasExited, integrationEnv, stopChild, waitForHealth } from './servers';

// On Linux, where CI runs, a process can ignore SIGTERM; on Windows any signal
// ends it. So the signals a stop sends are observed on a stand-in child too.

/** A child process as stopChild sees it: it records the signals it is sent, and exits on the ones it does not ignore. */
class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly signals: NodeJS.Signals[] = [];
  constructor(private readonly exitsOn: NodeJS.Signals[]) {
    super();
  }
  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.signals.push(signal);
    if (this.exitsOn.includes(signal)) {
      this.signalCode = signal;
      this.emit('exit', null, signal);
    }
    return true;
  }
}
const asChild = (fake: FakeChild) => fake as unknown as ChildProcess;

/** A Node process running `script`, resolved once it has printed `ready`. */
async function nodeProcess(script: string): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise<void>((ready, fail) => {
    child.stdout!.once('data', () => ready());
    child.once('exit', () => fail(new Error('the process exited before it was ready')));
  });
  return child;
}

const servers: Server[] = [];
/** A TCP server listening on a free port of `host`, closed after the test. */
async function listening(host: string): Promise<number> {
  const server = createServer((socket) => socket.end());
  servers.push(server);
  await new Promise<void>((done) => server.listen({ port: 0, host }, done));
  return (server.address() as { port: number }).port;
}
/** A port nothing listens on. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen({ port: 0, host: '0.0.0.0' }, done));
  const { port } = server.address() as { port: number };
  await new Promise((done) => server.close(done));
  return port;
}

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((s) => new Promise((done) => s.close(done))));
});

describe('stopping a server', () => {
  it('sends SIGTERM, then SIGKILL once the grace has passed with the server still running', async () => {
    vi.useFakeTimers();
    const child = new FakeChild(['SIGKILL']);
    const stopped = stopChild(asChild(child), 5_000);
    expect(child.signals).toEqual(['SIGTERM']);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(child.signals).toEqual(['SIGTERM']);
    await vi.advanceTimersByTimeAsync(1);
    expect(child.signals).toEqual(['SIGTERM', 'SIGKILL']);
    await stopped;
  });

  it('sends nothing more to a server that exits on SIGTERM', async () => {
    vi.useFakeTimers();
    const child = new FakeChild(['SIGTERM']);
    await stopChild(asChild(child), 5_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(child.signals).toEqual(['SIGTERM']);
  });

  it('sends nothing to a server that has already exited, by a signal or with a code', async () => {
    const bySignal = Object.assign(new FakeChild([]), { signalCode: 'SIGKILL' as const });
    const withCode = Object.assign(new FakeChild([]), { exitCode: 1 });
    await stopChild(asChild(bySignal), 5_000);
    await stopChild(asChild(withCode), 5_000);
    expect([bySignal.signals, withCode.signals]).toEqual([[], []]);
  });

  it('ends a real process that ignores SIGTERM', async () => {
    const child = await nodeProcess("process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); console.log('ready');");
    await stopChild(child, 300);
    expect(hasExited(child)).toBe(true);
    // Linux delivers SIGTERM to the handler, which ignores it, so SIGKILL ends it.
    expect(child.signalCode).toBe(process.platform === 'win32' ? 'SIGTERM' : 'SIGKILL');
  });
});

describe('a server that a signal ended', () => {
  it('has no exit code, and still counts as exited', async () => {
    const child = await nodeProcess("setInterval(() => {}, 1000); console.log('ready');");
    const exited = new Promise((done) => child.once('exit', done));
    child.kill('SIGKILL');
    await exited;
    expect(child.exitCode).toBeNull();
    expect(hasExited(child)).toBe(true);
  });
});

describe('waiting for a server to answer', () => {
  it('fails at once for a server a signal has ended, naming the signal', async () => {
    const url = `http://127.0.0.1:${await freePort()}`;
    await expect(waitForHealth(url, { exitCode: null, signalCode: 'SIGKILL' }, 'w0.log')).rejects.toThrow(
      `The server for ${url} exited (SIGKILL) before it answered; see w0.log.`
    );
  });

  it('fails when another process answers in place of a server that has exited', async () => {
    // The new server dies on the taken port while the old one answers.
    const child = { exitCode: null as number | null, signalCode: null };
    const standIn = createHttpServer((_req, res) => {
      child.exitCode = 1;
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}');
    });
    servers.push(standIn);
    await new Promise<void>((done) => standIn.listen(0, '127.0.0.1', done));
    const url = `http://127.0.0.1:${(standIn.address() as { port: number }).port}`;
    await expect(waitForHealth(url, child, 'w0.log')).rejects.toThrow('another process answered in its place');
  });

  it('resolves once a server that is still running answers', async () => {
    const standIn = createHttpServer((_req, res) => res.writeHead(200).end());
    servers.push(standIn);
    await new Promise<void>((done) => standIn.listen(0, '127.0.0.1', done));
    const url = `http://127.0.0.1:${(standIn.address() as { port: number }).port}`;
    await expect(waitForHealth(url, { exitCode: null, signalCode: null }, 'w0.log')).resolves.toBeUndefined();
  });
});

describe('the ports a run starts its servers on', () => {
  it('refuses a port a server is bound to, naming it and the server an earlier run probably left', async () => {
    const port = await listening('0.0.0.0');
    await expect(assertPortsFree([port])).rejects.toThrow(
      `Port ${port} is already in use: a server from an earlier run is probably still running. Stop it, then start the run again.`
    );
  });

  it('refuses a port a server answers on loopback alone, which Windows would still let the new server bind', async () => {
    const port = await listening('127.0.0.1');
    await expect(assertPortsFree([port])).rejects.toThrow(`Port ${port} is already in use`);
  });

  it('names every taken port, and only those', async () => {
    const [taken, other, free] = [await listening('0.0.0.0'), await listening('0.0.0.0'), await freePort()];
    await expect(assertPortsFree([taken, free, other])).rejects.toThrow(`Ports ${taken}, ${other} are already in use`);
  });

  it('accepts ports nothing holds', async () => {
    await expect(assertPortsFree([await freePort(), await freePort()])).resolves.toBeUndefined();
  });
});

describe("the servers' environment", () => {
  it("carries a key of the run's own: fit, new every time, never the one a developer's .env put in the runner's environment", () => {
    const developers = randomBytes(32).toString('base64');
    vi.stubEnv('APP_SECRET_KEY', developers);
    const first = integrationEnv().APP_SECRET_KEY;
    expect(first).not.toBe(developers);
    expect(secretKeyProblem(first)).toBeNull();
    expect(integrationEnv().APP_SECRET_KEY).not.toBe(first);
  });
});
