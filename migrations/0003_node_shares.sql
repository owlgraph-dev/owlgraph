-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Alexander Rensch
-- This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

-- Every node has a share list (docs/adr/0027-one-rule-says-who-may-change-a-node.md):
-- one table for every node in place of one for pages and one for documents. A
-- collection, which had none, gets one too. Every share is kept.

create table if not exists node_shares (
  node_id uuid not null references nodes (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  primary key (node_id, user_id)
);

create index if not exists node_shares_user_idx on node_shares (user_id);

insert into node_shares (node_id, user_id)
select page_id, user_id from page_shares
on conflict do nothing;

insert into node_shares (node_id, user_id)
select document_id, user_id from document_shares
on conflict do nothing;

drop table page_shares;
drop table document_shares;
