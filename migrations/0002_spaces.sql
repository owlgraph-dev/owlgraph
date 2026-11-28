-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Alexander Rensch
-- This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

-- Namespaces are called spaces (docs/adr/0022-namespaces-are-called-spaces.md):
-- the tables, their columns, constraints and indexes, the scope a theme, a
-- stylesheet or a layout preset may have, and the names a query block stores
-- in pages and in their stored versions. No stored name is left to be read as
-- an alias. src/lib/platform/spacesMigration.int.test.ts holds the rewrite of
-- stored content.

alter table namespaces rename to spaces;
alter table namespace_members rename to space_members;
alter table space_members rename column namespace_id to space_id;
alter table nodes rename column namespace_id to space_id;

alter table spaces rename constraint namespaces_pkey to spaces_pkey;
alter table spaces rename constraint namespaces_slug_key to spaces_slug_key;
alter table spaces rename constraint namespaces_access_level_check to spaces_access_level_check;
alter table spaces rename constraint namespaces_slug_null_iff_default_check to spaces_slug_null_iff_default_check;
alter index namespaces_one_default_idx rename to spaces_one_default_idx;
alter table space_members rename constraint namespace_members_pkey to space_members_pkey;
alter table space_members rename constraint namespace_members_namespace_id_fkey to space_members_space_id_fkey;
alter table space_members rename constraint namespace_members_user_id_fkey to space_members_user_id_fkey;
alter index namespace_members_user_idx rename to space_members_user_idx;
alter table nodes rename constraint nodes_namespace_slug_key to nodes_space_slug_key;
alter table nodes rename constraint nodes_namespace_id_fkey to nodes_space_id_fkey;

-- A scope is the site or one space. Only the site is used so far.
alter table themes drop constraint themes_scope_kind_check;
update themes set scope_kind = 'space' where scope_kind = 'namespace';
alter table themes add constraint themes_scope_kind_check check (scope_kind in ('site', 'space'));

alter table stylesheets drop constraint stylesheets_scope_kind_check;
update stylesheets set scope_kind = 'space' where scope_kind = 'namespace';
alter table stylesheets add constraint stylesheets_scope_kind_check check (scope_kind in ('site', 'space'));

alter table page_layout_presets drop constraint page_layout_presets_scope_kind_check;
update page_layout_presets set scope_kind = 'space' where scope_kind = 'namespace';
alter table page_layout_presets add constraint page_layout_presets_scope_kind_check check (scope_kind in ('site', 'space'));

-- What a query block stores (docs/architecture/dynamic-rendering.md): a filter
-- whose intrinsic field is NAMESPACE_ID, at any depth of and/or, in the block's
-- own filter, a traversal's start and each of its steps; an intrinsic sort on
-- namespaceId; and the binding key `namespace` in the block's template: a
-- mapping's key or source, a parameter mark named exactly `namespace`, and an
-- HTML block's {{{namespace}}} or {{{namespace:<datatype>}}} token. Nothing
-- outside a query block is touched. The functions are this file's alone.

create function spaces_0002_filter(f jsonb) returns jsonb language plpgsql immutable as $$
declare
  out jsonb := f;
  op text;
begin
  if f is null or jsonb_typeof(f) <> 'object' then
    return f;
  end if;
  if jsonb_typeof(f->'intrinsic') = 'object' and f->'intrinsic'->>'field' = 'NAMESPACE_ID' then
    out := jsonb_set(out, '{intrinsic,field}', '"SPACE_ID"');
  end if;
  foreach op in array array['and', 'or'] loop
    if jsonb_typeof(f->op) = 'array' then
      out := jsonb_set(out, array[op], (
        select coalesce(jsonb_agg(spaces_0002_filter(e) order by i), '[]'::jsonb)
        from jsonb_array_elements(f->op) with ordinality as t(e, i)));
    end if;
  end loop;
  return out;
end
$$;

create function spaces_0002_mapping(m jsonb) returns jsonb language plpgsql immutable as $$
begin
  if m is null or jsonb_typeof(m) <> 'object' then
    return m;
  end if;
  return (
    select coalesce(jsonb_object_agg(
      case when k = 'namespace' and m->'space' is null then 'space' else k end,
      case when jsonb_typeof(v) = 'object' and v->>'source' = 'namespace' then jsonb_set(v, '{source}', '"space"') else v end
    ), '{}'::jsonb)
    from jsonb_each(m) as e(k, v));
end
$$;

create function spaces_0002_query_attrs(a jsonb) returns jsonb language plpgsql immutable as $$
declare
  out jsonb := a;
  t jsonb;
begin
  if jsonb_typeof(a->'filter') = 'object' then
    out := jsonb_set(out, '{filter}', spaces_0002_filter(a->'filter'));
  end if;
  if jsonb_typeof(a->'traversal') = 'object' then
    t := a->'traversal';
    if jsonb_typeof(t->'start') = 'object' and jsonb_typeof(t->'start'->'filter') = 'object' then
      t := jsonb_set(t, '{start,filter}', spaces_0002_filter(t->'start'->'filter'));
    end if;
    if jsonb_typeof(t->'steps') = 'array' then
      t := jsonb_set(t, '{steps}', (
        select coalesce(jsonb_agg(
          case when jsonb_typeof(s) = 'object' and jsonb_typeof(s->'targetFilter') = 'object'
            then jsonb_set(s, '{targetFilter}', spaces_0002_filter(s->'targetFilter'))
            else s end
          order by i), '[]'::jsonb)
        from jsonb_array_elements(t->'steps') with ordinality as x(s, i)));
    end if;
    out := jsonb_set(out, '{traversal}', t);
  end if;
  if jsonb_typeof(a->'orderBy') = 'object' and a->'orderBy'->>'kind' = 'INTRINSIC' and a->'orderBy'->>'name' = 'namespaceId' then
    out := jsonb_set(out, '{orderBy,name}', '"spaceId"');
  end if;
  if jsonb_typeof(a->'mapping') = 'object' then
    out := jsonb_set(out, '{mapping}', spaces_0002_mapping(a->'mapping'));
  end if;
  return out;
end
$$;

-- A node of a stored document; `in_query` once inside a query block.
create function spaces_0002_node(n jsonb, in_query boolean) returns jsonb language plpgsql immutable as $$
declare
  out jsonb := n;
  q boolean := in_query;
begin
  if n is null or jsonb_typeof(n) <> 'object' then
    return n;
  end if;
  if n->>'type' = 'queryBlock' and jsonb_typeof(n->'attrs') = 'object' then
    q := true;
    out := jsonb_set(out, '{attrs}', spaces_0002_query_attrs(n->'attrs'));
  end if;
  if q and n->>'type' = 'text' and jsonb_typeof(n->'marks') = 'array' then
    out := jsonb_set(out, '{marks}', (
      select coalesce(jsonb_agg(
        case when jsonb_typeof(mk) = 'object' and mk->>'type' = 'semanticProperty' and mk->'attrs'->>'propName' = 'namespace'
          then jsonb_set(mk, '{attrs,propName}', '"space"')
          else mk end
        order by i), '[]'::jsonb)
      from jsonb_array_elements(n->'marks') with ordinality as t(mk, i)));
  end if;
  if q and n->>'type' = 'htmlBlock' and jsonb_typeof(n->'attrs') = 'object' and jsonb_typeof(n->'attrs'->'html') = 'string' then
    out := jsonb_set(out, '{attrs,html}', to_jsonb(regexp_replace(
      n->'attrs'->>'html',
      '\{\{\{namespace(:(text|longtext|number|date|boolean|url|page))?\}\}\}',
      '{{{space\1}}}',
      'g')));
  end if;
  if jsonb_typeof(n->'content') = 'array' then
    out := jsonb_set(out, '{content}', (
      select coalesce(jsonb_agg(spaces_0002_node(c, q) order by i), '[]'::jsonb)
      from jsonb_array_elements(n->'content') with ordinality as t(c, i)));
  end if;
  return out;
end
$$;

update pages set doc = spaces_0002_node(doc, false)
where doc::text like '%"queryBlock"%' and spaces_0002_node(doc, false) is distinct from doc;

update page_versions set doc = spaces_0002_node(doc, false)
where doc::text like '%"queryBlock"%' and spaces_0002_node(doc, false) is distinct from doc;

drop function spaces_0002_node(jsonb, boolean);
drop function spaces_0002_query_attrs(jsonb);
drop function spaces_0002_mapping(jsonb);
drop function spaces_0002_filter(jsonb);
