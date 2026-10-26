// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Re-seals every source secret and connection credential under the current
// APP_SECRET_KEY after a rotation (docs/architecture/authorization.md, "Secrets"); drop the
// old key once this reports nothing left under it. Safe to re-run. A value no
// key opens is listed by id, never a character of it, and the run exits 1.
// Grants and connects in progress last minutes, so the previous key covers them.
//
//   npm run secrets:rotate
import { db } from '../src/lib/platform/db.server';
import { secretBox, SecretKeyMissing } from '../src/lib/platform/secretBox.server';
import { allSealedSecrets, replaceSealedSecret } from '../src/lib/features/pluginHost/secrets.server';
import { allSealedCredentials, replaceSealedCredential } from '../src/lib/features/pluginHost/connections.server';

let box: ReturnType<typeof secretBox>;
try {
  box = secretBox();
} catch (e) {
  if (e instanceof SecretKeyMissing) {
    console.error(`${e.message} — nothing can be sealed (docs/guides/deployment.md shows how to make a key).`);
    process.exit(1);
  }
  throw e;
}

let resealed = 0;
let current = 0;
let changedMeanwhile = 0;
const lost: string[] = [];
for (const row of await allSealedSecrets()) {
  if (!box.isStale(row.sealed)) {
    current++;
    continue;
  }
  const plaintext = box.open('node-source-secret', row.sealed);
  if (plaintext === null) {
    lost.push(row.node_id);
    continue;
  }
  if (await replaceSealedSecret(db, row.node_id, row.sealed, box.seal('node-source-secret', plaintext))) resealed++;
  else changedMeanwhile++;
}
for (const row of await allSealedCredentials()) {
  if (!box.isStale(row.sealed_credential)) {
    current++;
    continue;
  }
  // Re-sealed as it is: what it is bound to (its user, integration, origin) is part of the sealed value.
  const plaintext = box.open('user-credential', row.sealed_credential);
  if (plaintext === null) {
    lost.push(`connection ${row.id}`);
    continue;
  }
  if (await replaceSealedCredential(db, row.id, row.sealed_credential, box.seal('user-credential', plaintext))) resealed++;
  else changedMeanwhile++;
}

console.log(`Re-sealed ${resealed}; already under the current key ${current}.`);
if (changedMeanwhile > 0) console.log(`${changedMeanwhile} changed while this ran — run it again.`);
if (lost.length > 0) {
  console.log(`${lost.length} under no key this deployment has (connect their sources again): ${lost.join(', ')}`);
  process.exit(1);
}
process.exit(0);
