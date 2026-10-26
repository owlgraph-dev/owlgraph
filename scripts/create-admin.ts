// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Creates the first admin.
//   npm run create-admin -- admin@example.com ["Admin Name"]
//
// The password is never an argument, which shell history and the process list
// would keep: it is prompted for on a terminal, else read from stdin:
//   docker compose exec app npx tsx --tsconfig tsconfig.tsx.json scripts/create-admin.ts admin@example.com
//   printf '%s' "$ADMIN_PASSWORD" | docker compose exec -T app npx tsx … scripts/create-admin.ts admin@example.com
import { createInterface } from 'node:readline';
import { createUser, getUserByEmail } from '../src/lib/features/auth/server';
import { passwordProblem, passwordProblemMessage } from '../src/lib/features/auth';
import { db } from '../src/lib/platform/db.server';

async function fail(message: string): Promise<never> {
  console.error(message);
  await db.end();
  process.exit(1);
}

// Prompts on stderr with the typed characters hidden.
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    let muted = false;
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput.bind(rl);
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (!muted || s.includes('\n')) write(muted ? '\n' : s);
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

async function readStdin(): Promise<string> {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.replace(/\r?\n$/, '');
}

const args = process.argv.slice(2);
const [email, name] = args;
if (!email || args.length > 2) {
  await fail(
    'Usage: npm run create-admin -- <email> ["Name"]\n' +
      'The password is prompted for (or read from stdin) — never passed as an argument.'
  );
}

if (await getUserByEmail(email)) await fail(`A user with email "${email}" already exists.`);

let password: string;
if (process.stdin.isTTY) {
  password = await promptHidden('Password: ');
  const problem = passwordProblem(password);
  if (problem) await fail(passwordProblemMessage(problem));
  if ((await promptHidden('Repeat password: ')) !== password) await fail('The passwords do not match.');
} else {
  password = await readStdin();
}

const problem = passwordProblem(password);
if (problem) await fail(passwordProblemMessage(problem));

const user = await createUser({ email, password, name: name ?? 'Admin', role: 'admin' });
console.log(`Created admin: ${user.email} (${user.id})`);
await db.end();
process.exit(0);
