// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Runs the Postgres tools inside its container (docs/guides/backup.md): the compose
// service by default, which publishes no port, or the container named by
// `--container=<name>` or PG_CONTAINER. Inside it the unix socket trusts the
// container's own $POSTGRES_USER, so no password is ever read or passed.
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import type { Readable, Writable } from 'node:stream';

// Postgres silently cuts an identifier to 63 bytes, so `<name>_rt` cut short
// can be <name> itself, and dropping the scratch database would drop the live
// one. The alphabet is ASCII, a byte a character.
const MAX_IDENTIFIER_BYTES = 63;

export function safeIdentifier(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Refusing to use unsafe-looking identifier: "${name}"`);
  }
  if (name.length > MAX_IDENTIFIER_BYTES) {
    throw new Error(
      `Refusing to use identifier longer than ${MAX_IDENTIFIER_BYTES} bytes, which Postgres would cut short to another name: "${name}" (${name.length} bytes)`
    );
  }
  return name;
}

// Not safeIdentifier: a container name may hold hyphens (`owlgraph-postgres`).
function safeContainerName(name: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) {
    throw new Error(`Refusing to use unsafe-looking container name: "${name}"`);
  }
  return name;
}

// The flag wins over PG_CONTAINER; neither leaves every helper on compose.
const containerArg = process.argv.find((a) => a.startsWith('--container='));
const containerOverride = containerArg
  ? safeContainerName(containerArg.slice('--container='.length))
  : process.env.PG_CONTAINER
    ? safeContainerName(process.env.PG_CONTAINER)
    : undefined;

export function pgTargetDescription(): string {
  return containerOverride ? `container "${containerOverride}"` : 'the compose postgres service';
}

// No pseudo-TTY in either form, so a custom-format dump passes through untouched.
function dockerArgs(command: string[]): string[] {
  return containerOverride
    ? ['exec', '-i', containerOverride, ...command]
    : ['compose', 'exec', '-T', 'postgres', ...command];
}

interface ExecOpts {
  stdin?: Readable;
  stdout?: Writable;
}

// Resolves once the child has exited and a piped stdout has finished flushing.
export function execInPostgres(shellCommand: string, opts: ExecOpts = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      dockerArgs(['sh', '-c', shellCommand]),
      { stdio: [opts.stdin ? 'pipe' : 'ignore', opts.stdout ? 'pipe' : 'inherit', 'inherit'] }
    );

    if (opts.stdin) opts.stdin.pipe(child.stdin!);

    let stdoutDone = Promise.resolve();
    if (opts.stdout) {
      const stdout = opts.stdout;
      stdoutDone = new Promise((res) => child.stdout!.pipe(stdout).on('finish', res));
    }

    child.on('error', reject);
    child.on('close', (code) => {
      stdoutDone.then(() => {
        if (code === 0) resolve();
        else reject(new Error(`docker exec on ${pgTargetDescription()} exited with code ${code}: sh -c '${shellCommand}'`));
      });
    });
  });
}

export interface DumpMigrationRow {
  version: string;
  filename: string;
  checksum: string;
}

// A dump's schema_migrations rows, read from the archive without restoring it.
export async function readDumpMigrations(file: string): Promise<DumpMigrationRow[]> {
  let output = '';
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'docker',
      dockerArgs(['pg_restore', '--data-only', '--table=schema_migrations', '-f', '-']),
      { stdio: ['pipe', 'pipe', 'inherit'] }
    );
    createReadStream(file).pipe(child.stdin!);
    child.stdout!.on('data', (chunk) => (output += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_restore (reading schema_migrations from "${file}") exited with code ${code}`));
    });
  });

  return parseMigrationRows(output);
}

/** The rows of pg_restore's `COPY public.schema_migrations (…) FROM stdin;` block, by its column list. */
export function parseMigrationRows(output: string): DumpMigrationRow[] {
  const match = /^COPY public\.schema_migrations \(([^)]*)\) FROM stdin;\n([\s\S]*?)^\\\.$/m.exec(output.replace(/\r\n/g, '\n'));
  if (!match) return [];
  const columns = match[1].split(',').map((c) => c.trim());
  const at = (name: string) => {
    const i = columns.indexOf(name);
    if (i === -1) throw new Error(`The dump's schema_migrations has no ${name} column (it has ${columns.join(', ')}).`);
    return i;
  };
  const [version, filename, checksum] = [at('version'), at('filename'), at('checksum')];
  return match[2]
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'))
    .map((cells) => ({ version: cells[version], filename: cells[filename], checksum: cells[checksum] }));
}

// Migrates a restored database: the compose `migrate` service, or with a
// container override scripts/migrate.ts against DATABASE_URL, spawned so it owns
// its pool (on Windows `npx` needs a shell). `--no-deps` is load-bearing:
// without it compose recreates postgres whenever the shell's env differs from
// the one it came up with, mid-restore and with blank credentials.
export function runMigrateService(): Promise<void> {
  const [command, args, label] = containerOverride
    ? ['npx', ['tsx', '--tsconfig', 'tsconfig.tsx.json', 'scripts/migrate.ts'], 'scripts/migrate.ts']
    : ['docker', ['compose', 'run', '--rm', '--no-deps', 'migrate'], 'docker compose run --rm migrate'];

  return new Promise((resolve, reject) => {
    const child = spawn(command as string, args as string[], {
      stdio: 'inherit',
      shell: containerOverride !== undefined && process.platform === 'win32'
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with code ${code}`));
    });
  });
}
