// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// One production server per Playwright worker, on its worker's database
// (docs/guides/testing.md, "Servers"); its output goes to tests/e2e/.servers/.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_LOGS = path.join(here, '.servers');

/** The port worker `slot`'s server listens on; playwright.config.ts gives the worker the same. */
export const workerPort = (slot: number) => 4174 + slot;

/** How long a server has to exit on SIGTERM before it is killed. */
const STOP_GRACE_MS = 5_000;

export interface WorkerServer {
  slot: number;
  url: string;
  stop: () => Promise<void>;
}

/** A child ended by a signal has no exit code, so `exitCode` alone misses it. */
export function hasExited(child: Pick<ChildProcess, 'exitCode' | 'signalCode'>): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

const howItEnded = (child: Pick<ChildProcess, 'exitCode' | 'signalCode'>) => child.signalCode ?? `code ${child.exitCode}`;

/** SIGTERM, then SIGKILL after `graceMs`, so a teardown never waits on a server that doesn't exit. */
export function stopChild(child: ChildProcess, graceMs = STOP_GRACE_MS): Promise<void> {
  return new Promise((done) => {
    if (hasExited(child)) return done();
    const escalate = setTimeout(() => child.kill('SIGKILL'), graceMs);
    child.once('exit', () => {
      clearTimeout(escalate);
      done();
    });
    child.kill('SIGTERM');
  });
}

function answers(port: number, host: string): Promise<boolean> {
  return new Promise((done) => {
    const socket = connect({ port, host });
    socket.once('connect', () => {
      socket.destroy();
      done(true);
    });
    socket.once('error', () => done(false));
  });
}

function bound(port: number): Promise<boolean> {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once('error', (e: NodeJS.ErrnoException) => (e.code === 'EADDRINUSE' ? done(true) : fail(e)));
    // The address the server binds (adapter-node's default host).
    probe.listen({ port, host: '0.0.0.0' }, () => probe.close(() => done(false)));
  });
}

/**
 * Refuses ports another process holds: a server left from an earlier run would
 * answer the health check in the new one's place. Both loopback and the bind
 * are checked, since on Windows 127.0.0.1 doesn't keep another from 0.0.0.0.
 */
export async function assertPortsFree(ports: number[]): Promise<void> {
  const inUse = async (port: number) => (await answers(port, '127.0.0.1')) || (await answers(port, '::1')) || (await bound(port));
  const busy = await Promise.all(ports.map(inUse));
  const taken = ports.filter((_, i) => busy[i]);
  if (!taken.length) return;
  const one = taken.length === 1;
  throw new Error(
    `${one ? 'Port' : 'Ports'} ${taken.join(', ')} ${one ? 'is' : 'are'} already in use: ` +
      'a server from an earlier run is probably still running. Stop it, then start the run again.'
  );
}

/** Resolves once `url` answers while `child` still runs; after it exits, an answer is another process's. */
export async function waitForHealth(url: string, child: Pick<ChildProcess, 'exitCode' | 'signalCode'>, log: string): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (hasExited(child)) throw new Error(`The server for ${url} exited (${howItEnded(child)}) before it answered; see ${log}.`);
    const healthy = await fetch(`${url}/api/health`).then((res) => res.ok, () => false);
    if (healthy) {
      if (hasExited(child)) throw new Error(`The server for ${url} exited (${howItEnded(child)}), and another process answered in its place; see ${log}.`);
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`The server for ${url} did not answer /api/health within two minutes; see ${log}.`);
}

/**
 * A sealing key and plain http to the specs' stand-ins (platform/upstream.server.ts).
 * A new key per run, never this process's: that comes from a developer's .env,
 * which CI lacks, so locally and in CI the servers would differ.
 */
export function integrationEnv(): Record<string, string> {
  return { APP_SECRET_KEY: randomBytes(32).toString('base64'), INTEGRATIONS_ALLOW_HTTP_LOOPBACK: '1' };
}

/** Starts `node build` for each worker database, and resolves once every one answers. */
export async function startWorkerServers(databases: string[]): Promise<WorkerServer[]> {
  await assertPortsFree(databases.map((_, slot) => workerPort(slot)));
  mkdirSync(SERVER_LOGS, { recursive: true });
  const env = integrationEnv();
  const started = databases.map((database, slot) => {
    const port = workerPort(slot);
    const url = `http://localhost:${port}`;
    const log = path.join(SERVER_LOGS, `w${slot}.log`);
    const fd = openSync(log, 'w');
    const child = spawn(process.execPath, ['build'], {
      stdio: ['ignore', fd, fd],
      env: {
        ...process.env,
        ...env,
        DATABASE_URL: database,
        PORT: String(port),
        ORIGIN: url,
        // For the design-system a11y spec.
        ENABLE_DESIGN_PLAYGROUND: 'true',
        // As the production compose file sets it.
        BODY_SIZE_LIMIT: '26M',
      },
    });
    let stopped: Promise<void> | undefined;
    const stop = () => (stopped ??= stopChild(child).then(() => closeSync(fd)));
    return { slot, url, child, log, stop };
  });
  try {
    await Promise.all(started.map((s) => waitForHealth(s.url, s.child, s.log)));
  } catch (e) {
    await Promise.all(started.map((s) => s.stop()));
    throw e;
  }
  return started.map(({ slot, url, stop }) => ({ slot, url, stop }));
}
