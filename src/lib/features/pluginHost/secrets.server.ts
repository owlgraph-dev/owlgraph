// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Node source secrets at rest (docs/architecture/authorization.md, "Secrets"), in a table no
// node read path selects. Only sealed values pass through here: the host
// (host.server.ts) and the rotation script seal and open them.
import { db, type TxSql } from '$lib/platform/db.server';

/** Only when the node's integration is `plugin`. */
export async function sealedSecretOf(nodeId: string, plugin: string, sql: TxSql = db): Promise<string | null> {
  const [row] = await sql<{ sealed: string }[]>`
    select sealed from node_source_secrets where node_id = ${nodeId} and plugin = ${plugin}`;
  return row?.sealed ?? null;
}

/** Replaces the one the node had. */
export async function storeSealedSecret(sql: TxSql, nodeId: string, plugin: string, sealed: string): Promise<void> {
  await sql`
    insert into node_source_secrets (node_id, plugin, sealed) values (${nodeId}, ${plugin}, ${sealed})
    on conflict (node_id) do update set plugin = excluded.plugin, sealed = excluded.sealed, updated_at = now()`;
}

/** For a rotation (scripts/rotate-secrets.ts). */
export async function allSealedSecrets(sql: TxSql = db): Promise<{ node_id: string; sealed: string }[]> {
  return sql<{ node_id: string; sealed: string }[]>`select node_id, sealed from node_source_secrets order by node_id`;
}

/** Replaces a sealed credential with its re-sealing, unless it changed in the meantime. */
export async function replaceSealedSecret(sql: TxSql, nodeId: string, before: string, after: string): Promise<boolean> {
  const rows = await sql`
    update node_source_secrets set sealed = ${after}, updated_at = now()
    where node_id = ${nodeId} and sealed = ${before} returning node_id`;
  return rows.length > 0;
}
