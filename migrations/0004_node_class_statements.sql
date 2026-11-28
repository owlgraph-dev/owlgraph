-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Alexander Rensch
-- This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

-- A node has any number of classes (docs/features/006-semantic-layer.md,
-- criterion 6): each one a statement of its own, in place of the one class a
-- node held. Every node keeps the class it has.
--
-- Until the type classes go, a node with no class of its own states its type
-- class, and a class is given only to nodes of its type. The database keeps
-- that rule as it kept it for the one class: a statement carries its node's
-- type, which must be its node's and its class's alike, so a class can neither
-- be given to a node of another type nor moved under another type while a node
-- has it.

-- What a statement's node and type are checked against.
alter table nodes add constraint nodes_id_type_key unique (id, type);

create table node_class_statements (
  node_id uuid not null,
  class_id uuid not null,
  node_type text not null,
  primary key (node_id, class_id),
  constraint node_class_statements_node_fkey foreign key (node_id, node_type) references nodes (id, type) on delete cascade,
  constraint node_class_statements_class_fkey foreign key (class_id) references node_classes (id) on delete restrict,
  constraint node_class_statements_class_type_fkey foreign key (class_id, node_type) references node_classes (id, node_type)
);

create index node_class_statements_class_idx on node_class_statements (class_id);

insert into node_class_statements (node_id, class_id, node_type)
select id, class_id, type from nodes;

alter table nodes drop constraint nodes_class_type_fkey;
alter table nodes drop constraint nodes_class_id_fkey;
drop index nodes_class_idx;
alter table nodes drop column class_id;
