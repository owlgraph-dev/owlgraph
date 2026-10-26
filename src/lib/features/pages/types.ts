// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The pages feature's DTOs: what its routes answer and its client reads.

/** A page's edit lock as the lock route reports it. */
export interface LockStatus {
  locked: boolean;
  lockedById: string | null;
  lockedByName: string | null;
  acquiredAt: string | null;
  heartbeatAt: string | null;
  stale: boolean; // may be taken over
}

/** Who holds a lock, as a refused acquisition names them. */
export type LockHolder = Pick<LockStatus, 'lockedByName' | 'stale'>;
