-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Alexander Rensch
-- This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

-- GENERATED FILE — do not hand-edit. Documentation-only snapshot of the
-- live schema, produced by:
--   npm run db:dump-schema -- --container=<name>
-- Not applied to any database — migrations/ is the only thing that builds or
-- updates one. Regenerate after every migration. See docs/architecture/migrations.md.

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.14 (Debian 16.14-1.pgdg13+1)
-- Dumped by pg_dump version 16.14 (Debian 16.14-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: prop_safe_date(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prop_safe_date(v text) RETURNS date
    LANGUAGE plpgsql IMMUTABLE
    AS $$
begin
  return v::date;
exception when others then
  return null;
end;
$$;


--
-- Name: prop_safe_numeric(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prop_safe_numeric(v text) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    AS $$
begin
  return v::numeric;
exception when others then
  return null;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: api_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    token_hash text NOT NULL,
    prefix text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone
);


--
-- Name: asset_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_variants (
    asset_id uuid NOT NULL,
    width integer NOT NULL,
    mime text NOT NULL,
    size integer NOT NULL,
    bytes bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT asset_variants_width_check CHECK ((width > 0))
);


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text DEFAULT 'image'::text NOT NULL,
    mime text NOT NULL,
    size integer NOT NULL,
    bytes bytea NOT NULL,
    sha256 text NOT NULL,
    scope text DEFAULT 'page'::text NOT NULL,
    owner_page_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_user_id uuid,
    width integer,
    height integer,
    CONSTRAINT assets_size_positive_check CHECK ((((width IS NULL) AND (height IS NULL)) OR ((width > 0) AND (height > 0))))
);


--
-- Name: collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collections (
    id uuid NOT NULL,
    plugin text,
    source_ref jsonb,
    search_title text,
    search_meta text,
    search_locale text NOT NULL,
    search_tsv tsvector GENERATED ALWAYS AS ((setweight(to_tsvector(
CASE search_locale
    WHEN 'de'::text THEN 'german'::regconfig
    WHEN 'en'::text THEN 'english'::regconfig
    ELSE 'simple'::regconfig
END, COALESCE(search_title, ''::text)), 'A'::"char") || setweight(to_tsvector(
CASE search_locale
    WHEN 'de'::text THEN 'german'::regconfig
    WHEN 'en'::text THEN 'english'::regconfig
    ELSE 'simple'::regconfig
END, COALESCE(search_meta, ''::text)), 'B'::"char"))) STORED,
    source_search text,
    CONSTRAINT collections_plugin_format_check CHECK (((plugin IS NULL) OR (plugin ~ '^[a-z][a-z0-9-]{1,31}$'::text))),
    CONSTRAINT collections_source_ref_object_check CHECK (((source_ref IS NULL) OR (jsonb_typeof(source_ref) = 'object'::text))),
    CONSTRAINT collections_source_shape_check CHECK (((plugin IS NULL) = (source_ref IS NULL)))
);


--
-- Name: connection_flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connection_flows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id text NOT NULL,
    user_id uuid NOT NULL,
    plugin text NOT NULL,
    origin text NOT NULL,
    sealed text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    last_polled_at timestamp with time zone,
    polling_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT connection_flows_plugin_format_check CHECK ((plugin ~ '^[a-z][a-z0-9-]{1,31}$'::text))
);


--
-- Name: custom_styles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_styles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stylesheet_id uuid NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    kind text NOT NULL,
    css text DEFAULT ''::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT custom_styles_kind_check CHECK ((kind = ANY (ARRAY['inline'::text, 'block'::text]))),
    CONSTRAINT custom_styles_slug_check CHECK ((slug <> ''::text))
);


--
-- Name: document_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_shares (
    document_id uuid NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid NOT NULL,
    filename text DEFAULT ''::text NOT NULL,
    mime text,
    size integer,
    bytes bytea,
    sha256 text,
    search_text text,
    search_title text,
    source text DEFAULT 'upload'::text NOT NULL,
    external_url text,
    search_meta text,
    search_locale text NOT NULL,
    search_tsv tsvector GENERATED ALWAYS AS (((setweight(to_tsvector(
CASE search_locale
    WHEN 'de'::text THEN 'german'::regconfig
    WHEN 'en'::text THEN 'english'::regconfig
    ELSE 'simple'::regconfig
END, COALESCE(search_title, ''::text)), 'A'::"char") || setweight(to_tsvector(
CASE search_locale
    WHEN 'de'::text THEN 'german'::regconfig
    WHEN 'en'::text THEN 'english'::regconfig
    ELSE 'simple'::regconfig
END, COALESCE(search_meta, ''::text)), 'B'::"char")) || setweight(to_tsvector(
CASE search_locale
    WHEN 'de'::text THEN 'german'::regconfig
    WHEN 'en'::text THEN 'english'::regconfig
    ELSE 'simple'::regconfig
END, COALESCE(search_text, ''::text)), 'C'::"char"))) STORED,
    detected_locale text,
    plugin text,
    source_ref jsonb,
    source_search text,
    CONSTRAINT documents_detected_locale_format_check CHECK (((detected_locale IS NULL) OR (detected_locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'::text))),
    CONSTRAINT documents_external_url_length_check CHECK ((char_length(external_url) <= 2048)),
    CONSTRAINT documents_plugin_format_check CHECK (((plugin IS NULL) OR (plugin ~ '^[a-z][a-z0-9-]{1,31}$'::text))),
    CONSTRAINT documents_plugin_shape_check CHECK ((((source = 'plugin'::text) = (plugin IS NOT NULL)) AND ((plugin IS NULL) = (source_ref IS NULL)))),
    CONSTRAINT documents_source_check CHECK ((source = ANY (ARRAY['upload'::text, 'link'::text, 'plugin'::text]))),
    CONSTRAINT documents_source_ref_object_check CHECK (((source_ref IS NULL) OR (jsonb_typeof(source_ref) = 'object'::text))),
    CONSTRAINT documents_source_shape_check CHECK ((((source <> 'upload'::text) OR ((bytes IS NOT NULL) AND (mime IS NOT NULL) AND (size IS NOT NULL) AND (sha256 IS NOT NULL))) AND ((source = 'link'::text) = (external_url IS NOT NULL))))
);


--
-- Name: edge_properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.edge_properties (
    edge_id uuid NOT NULL,
    name text NOT NULL,
    value text NOT NULL
);


--
-- Name: edges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.edges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id uuid NOT NULL,
    target_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    relationship_type text,
    CONSTRAINT edges_no_self_check CHECK ((source_id <> target_id))
);


--
-- Name: font_families; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.font_families (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: font_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.font_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    weight integer NOT NULL,
    style text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT font_variants_style_check CHECK ((style = ANY (ARRAY['normal'::text, 'italic'::text]))),
    CONSTRAINT font_variants_weight_check CHECK (((weight >= 100) AND (weight <= 900)))
);


--
-- Name: footer_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.footer_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    label text NOT NULL,
    target_type text DEFAULT 'page'::text NOT NULL,
    target_page_id uuid,
    url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT footer_links_target_shape_check CHECK ((((target_type = 'page'::text) AND (target_page_id IS NOT NULL) AND (url IS NULL)) OR ((target_type = 'url'::text) AND (url IS NOT NULL) AND (target_page_id IS NULL)))),
    CONSTRAINT footer_links_target_type_check CHECK ((target_type = ANY (ARRAY['page'::text, 'url'::text])))
);


--
-- Name: namespace_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.namespace_members (
    namespace_id uuid NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: namespaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.namespaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text,
    name text NOT NULL,
    access_level text DEFAULT 'internal'::text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT namespaces_access_level_check CHECK ((access_level = ANY (ARRAY['public'::text, 'internal'::text, 'restricted'::text]))),
    CONSTRAINT namespaces_slug_null_iff_default_check CHECK (((slug IS NULL) = is_default))
);


--
-- Name: nav_tree_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nav_tree_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    consumer text NOT NULL,
    parent_id uuid,
    kind text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    label text NOT NULL,
    target_type text,
    target_page_id uuid,
    url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nav_tree_entries_consumer_check CHECK ((consumer = ANY (ARRAY['nav'::text, 'footer'::text]))),
    CONSTRAINT nav_tree_entries_group_no_parent_check CHECK (((kind = 'link'::text) OR (parent_id IS NULL))),
    CONSTRAINT nav_tree_entries_kind_check CHECK ((kind = ANY (ARRAY['group'::text, 'link'::text]))),
    CONSTRAINT nav_tree_entries_shape_check CHECK ((((kind = 'group'::text) AND (target_type IS NULL) AND (target_page_id IS NULL) AND (url IS NULL)) OR ((kind = 'link'::text) AND (((target_type = 'page'::text) AND (target_page_id IS NOT NULL) AND (url IS NULL)) OR ((target_type = 'url'::text) AND (url IS NOT NULL) AND (target_page_id IS NULL))))))
);


--
-- Name: node_classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    label jsonb DEFAULT '{}'::jsonb NOT NULL,
    description jsonb DEFAULT '{}'::jsonb NOT NULL,
    property_group text,
    overview_node_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'domain'::text NOT NULL,
    parent_id uuid,
    parent_kind text,
    node_type text,
    parent_node_type text,
    CONSTRAINT node_classes_description_object_check CHECK ((jsonb_typeof(description) = 'object'::text)),
    CONSTRAINT node_classes_kind_check CHECK ((kind = ANY (ARRAY['root'::text, 'type'::text, 'domain'::text]))),
    CONSTRAINT node_classes_label_object_check CHECK ((jsonb_typeof(label) = 'object'::text)),
    CONSTRAINT node_classes_node_type_check CHECK (((node_type IS NULL) OR (node_type = ANY (ARRAY['page'::text, 'document'::text, 'collection'::text])))),
    CONSTRAINT node_classes_shape_check CHECK ((((kind = 'root'::text) AND (parent_id IS NULL) AND (parent_kind IS NULL) AND (node_type IS NULL) AND (parent_node_type IS NULL)) OR ((kind = 'type'::text) AND (parent_id IS NOT NULL) AND (parent_kind = 'root'::text) AND (node_type = slug) AND (parent_node_type IS NULL)) OR ((kind = 'domain'::text) AND (parent_id IS NOT NULL) AND (parent_kind = ANY (ARRAY['type'::text, 'domain'::text])) AND (node_type IS NOT NULL) AND (parent_node_type = node_type))))
);


--
-- Name: node_properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_properties (
    node_id uuid NOT NULL,
    name text NOT NULL,
    value text NOT NULL,
    source text DEFAULT 'inline'::text NOT NULL
);


--
-- Name: node_source_secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_source_secrets (
    node_id uuid NOT NULL,
    plugin text NOT NULL,
    sealed text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT node_source_secrets_plugin_format_check CHECK ((plugin ~ '^[a-z][a-z0-9-]{1,31}$'::text))
);


--
-- Name: node_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_tags (
    node_id uuid NOT NULL,
    tag text NOT NULL
);


--
-- Name: node_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    node_id uuid NOT NULL,
    version_no integer NOT NULL,
    base_version_id uuid,
    kind text DEFAULT 'autosave'::text NOT NULL,
    author_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    visibility text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    slug text NOT NULL,
    namespace_id uuid NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    class_id uuid NOT NULL,
    locale text NOT NULL,
    CONSTRAINT nodes_locale_format_check CHECK ((locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'::text))
);


--
-- Name: page_layout_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.page_layout_presets (
    id text NOT NULL,
    scope_kind text DEFAULT 'site'::text NOT NULL,
    scope_id uuid,
    label jsonb NOT NULL,
    description jsonb DEFAULT '{}'::jsonb NOT NULL,
    mode text NOT NULL,
    template jsonb,
    gap jsonb DEFAULT '{}'::jsonb NOT NULL,
    section_defaults jsonb DEFAULT '{}'::jsonb NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    protected boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT page_layout_presets_description_object_check CHECK ((jsonb_typeof(description) = 'object'::text)),
    CONSTRAINT page_layout_presets_id_check CHECK ((id ~ '^[a-z0-9][a-z0-9-]*$'::text)),
    CONSTRAINT page_layout_presets_label_object_check CHECK (((jsonb_typeof(label) = 'object'::text) AND (label <> '{}'::jsonb))),
    CONSTRAINT page_layout_presets_mode_check CHECK ((mode = ANY (ARRAY['flow'::text, 'columns'::text]))),
    CONSTRAINT page_layout_presets_protected_check CHECK (((NOT protected) OR enabled)),
    CONSTRAINT page_layout_presets_scope_id_check CHECK (((scope_kind = 'site'::text) = (scope_id IS NULL))),
    CONSTRAINT page_layout_presets_scope_kind_check CHECK ((scope_kind = ANY (ARRAY['site'::text, 'namespace'::text]))),
    CONSTRAINT page_layout_presets_template_check CHECK (((mode = 'flow'::text) = (template IS NULL)))
);


--
-- Name: page_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.page_locks (
    page_id uuid NOT NULL,
    locked_by uuid NOT NULL,
    token uuid NOT NULL,
    acquired_at timestamp with time zone DEFAULT now() NOT NULL,
    heartbeat_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: page_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.page_shares (
    page_id uuid NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: page_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.page_versions (
    version_id uuid NOT NULL,
    doc jsonb NOT NULL
);


--
-- Name: pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pages (
    id uuid NOT NULL,
    doc jsonb DEFAULT '{"type": "doc", "content": []}'::jsonb NOT NULL,
    search_headings text,
    search_body text,
    search_title text,
    content_scheme text,
    search_locale text NOT NULL,
    search_tsv tsvector GENERATED ALWAYS AS (((setweight(to_tsvector(
CASE search_locale
    WHEN 'de'::text THEN 'german'::regconfig
    WHEN 'en'::text THEN 'english'::regconfig
    ELSE 'simple'::regconfig
END, COALESCE(search_title, ''::text)), 'A'::"char") || setweight(to_tsvector(
CASE search_locale
    WHEN 'de'::text THEN 'german'::regconfig
    WHEN 'en'::text THEN 'english'::regconfig
    ELSE 'simple'::regconfig
END, COALESCE(search_headings, ''::text)), 'B'::"char")) || setweight(to_tsvector(
CASE search_locale
    WHEN 'de'::text THEN 'german'::regconfig
    WHEN 'en'::text THEN 'english'::regconfig
    ELSE 'simple'::regconfig
END, COALESCE(search_body, ''::text)), 'C'::"char"))) STORED,
    CONSTRAINT pages_content_scheme_check CHECK ((content_scheme = ANY (ARRAY['light'::text, 'dark'::text, 'adaptive'::text])))
);


--
-- Name: paragraph_styles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paragraph_styles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label jsonb NOT NULL,
    render_as text NOT NULL,
    base_role text NOT NULL,
    token_id uuid,
    is_default boolean DEFAULT false NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT paragraph_styles_base_role_check CHECK ((base_role = ANY (ARRAY['h1'::text, 'h2'::text, 'h3'::text, 'h4'::text, 'h5'::text, 'h6'::text, 'body'::text, 'display'::text, 'label'::text]))),
    CONSTRAINT paragraph_styles_label_object_check CHECK ((jsonb_typeof(label) = 'object'::text)),
    CONSTRAINT paragraph_styles_render_as_check CHECK ((render_as = ANY (ARRAY['p'::text, 'h1'::text, 'h2'::text, 'h3'::text, 'h4'::text, 'h5'::text, 'h6'::text])))
);


--
-- Name: property_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_definitions (
    name text NOT NULL,
    label jsonb DEFAULT '{}'::jsonb NOT NULL,
    datatype text DEFAULT 'text'::text NOT NULL,
    description jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    group_slug text DEFAULT 'core'::text NOT NULL,
    CONSTRAINT property_definitions_description_object_check CHECK ((jsonb_typeof(description) = 'object'::text)),
    CONSTRAINT property_definitions_label_object_check CHECK ((jsonb_typeof(label) = 'object'::text)),
    CONSTRAINT property_definitions_name_matches_group_check CHECK ((POSITION(((group_slug || ':'::text)) IN (name)) = 1))
);


--
-- Name: property_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_groups (
    slug text NOT NULL,
    label jsonb DEFAULT '{}'::jsonb NOT NULL,
    description jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT property_groups_description_object_check CHECK ((jsonb_typeof(description) = 'object'::text)),
    CONSTRAINT property_groups_label_object_check CHECK ((jsonb_typeof(label) = 'object'::text))
);


--
-- Name: relationship_type_properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.relationship_type_properties (
    relationship_type_slug text NOT NULL,
    property_name text NOT NULL
);


--
-- Name: relationship_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.relationship_types (
    slug text NOT NULL,
    label jsonb DEFAULT '{}'::jsonb NOT NULL,
    description jsonb DEFAULT '{}'::jsonb NOT NULL,
    inverse_label jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT relationship_types_description_object_check CHECK ((jsonb_typeof(description) = 'object'::text)),
    CONSTRAINT relationship_types_inverse_label_object_check CHECK (((inverse_label IS NULL) OR (jsonb_typeof(inverse_label) = 'object'::text))),
    CONSTRAINT relationship_types_label_object_check CHECK ((jsonb_typeof(label) = 'object'::text))
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id text NOT NULL,
    user_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: share_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.share_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    node_id uuid NOT NULL,
    token_hash text NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: site_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings (
    key text NOT NULL,
    value text NOT NULL
);


--
-- Name: stylesheets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stylesheets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope_kind text NOT NULL,
    scope_id uuid,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    free_css text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stylesheets_scope_id_check CHECK (((scope_kind = 'site'::text) = (scope_id IS NULL))),
    CONSTRAINT stylesheets_scope_kind_check CHECK ((scope_kind = ANY (ARRAY['site'::text, 'namespace'::text])))
);


--
-- Name: themes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.themes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope_kind text NOT NULL,
    scope_id uuid,
    tokens jsonb DEFAULT '{"version": 1}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT themes_scope_id_check CHECK (((scope_kind = 'site'::text) = (scope_id IS NULL))),
    CONSTRAINT themes_scope_kind_check CHECK ((scope_kind = ANY (ARRAY['site'::text, 'namespace'::text])))
);


--
-- Name: typography_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.typography_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    family text,
    size text,
    weight text,
    line_height numeric,
    letter_spacing numeric,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT typography_tokens_letter_spacing_check CHECK (((letter_spacing IS NULL) OR ((letter_spacing >= '-0.05'::numeric) AND (letter_spacing <= 0.5)))),
    CONSTRAINT typography_tokens_line_height_check CHECK (((line_height IS NULL) OR ((line_height >= (1)::numeric) AND (line_height <= (3)::numeric)))),
    CONSTRAINT typography_tokens_size_check CHECK (((size IS NULL) OR
CASE
    WHEN (size ~ '^[0-9]{1,2}$'::text) THEN (((size)::integer >= 8) AND ((size)::integer <= 96))
    ELSE (size = ANY (ARRAY['scale:xs'::text, 'scale:s'::text, 'scale:m'::text, 'scale:l'::text, 'scale:xl'::text, 'scale:2xl'::text, 'scale:3xl'::text, 'scale:4xl'::text, 'scale:5xl'::text, 'scale:6xl'::text]))
END)),
    CONSTRAINT typography_tokens_weight_check CHECK (((weight IS NULL) OR (weight = ANY (ARRAY['normal'::text, 'medium'::text, 'semibold'::text, 'bold'::text]))))
);


--
-- Name: user_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    plugin text NOT NULL,
    origin text NOT NULL,
    credential_kind text NOT NULL,
    sealed_credential text NOT NULL,
    account_id text NOT NULL,
    account_label text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    last_error_at timestamp with time zone,
    CONSTRAINT user_connections_kind_check CHECK ((credential_kind = ANY (ARRAY['app_password'::text, 'oauth_token'::text, 'idp_token'::text]))),
    CONSTRAINT user_connections_plugin_format_check CHECK ((plugin ~ '^[a-z][a-z0-9-]{1,31}$'::text)),
    CONSTRAINT user_connections_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text, 'error'::text])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    password_hash text,
    role text DEFAULT 'viewer'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    locale text,
    CONSTRAINT users_locale_format_check CHECK (((locale IS NULL) OR (locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'::text))),
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'editor'::text, 'viewer'::text])))
);


--
-- Name: api_tokens api_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_pkey PRIMARY KEY (id);


--
-- Name: api_tokens api_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: asset_variants asset_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_variants
    ADD CONSTRAINT asset_variants_pkey PRIMARY KEY (asset_id, width);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: collections collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_pkey PRIMARY KEY (id);


--
-- Name: connection_flows connection_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connection_flows
    ADD CONSTRAINT connection_flows_pkey PRIMARY KEY (id);


--
-- Name: connection_flows connection_flows_session_plugin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connection_flows
    ADD CONSTRAINT connection_flows_session_plugin_key UNIQUE (session_id, plugin);


--
-- Name: custom_styles custom_styles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_styles
    ADD CONSTRAINT custom_styles_pkey PRIMARY KEY (id);


--
-- Name: document_shares document_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_shares
    ADD CONSTRAINT document_shares_pkey PRIMARY KEY (document_id, user_id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: edges edges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.edges
    ADD CONSTRAINT edges_pkey PRIMARY KEY (id);


--
-- Name: font_families font_families_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.font_families
    ADD CONSTRAINT font_families_pkey PRIMARY KEY (id);


--
-- Name: font_variants font_variants_asset_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.font_variants
    ADD CONSTRAINT font_variants_asset_id_key UNIQUE (asset_id);


--
-- Name: font_variants font_variants_family_id_weight_style_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.font_variants
    ADD CONSTRAINT font_variants_family_id_weight_style_key UNIQUE (family_id, weight, style);


--
-- Name: font_variants font_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.font_variants
    ADD CONSTRAINT font_variants_pkey PRIMARY KEY (id);


--
-- Name: footer_links footer_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.footer_links
    ADD CONSTRAINT footer_links_pkey PRIMARY KEY (id);


--
-- Name: namespace_members namespace_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.namespace_members
    ADD CONSTRAINT namespace_members_pkey PRIMARY KEY (namespace_id, user_id);


--
-- Name: namespaces namespaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.namespaces
    ADD CONSTRAINT namespaces_pkey PRIMARY KEY (id);


--
-- Name: namespaces namespaces_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.namespaces
    ADD CONSTRAINT namespaces_slug_key UNIQUE (slug);


--
-- Name: nav_tree_entries nav_tree_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nav_tree_entries
    ADD CONSTRAINT nav_tree_entries_pkey PRIMARY KEY (id);


--
-- Name: node_classes node_classes_id_kind_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_classes
    ADD CONSTRAINT node_classes_id_kind_key UNIQUE (id, kind);


--
-- Name: node_classes node_classes_id_node_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_classes
    ADD CONSTRAINT node_classes_id_node_type_key UNIQUE (id, node_type);


--
-- Name: node_classes node_classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_classes
    ADD CONSTRAINT node_classes_pkey PRIMARY KEY (id);


--
-- Name: node_classes node_classes_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_classes
    ADD CONSTRAINT node_classes_slug_key UNIQUE (slug);


--
-- Name: node_source_secrets node_source_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_source_secrets
    ADD CONSTRAINT node_source_secrets_pkey PRIMARY KEY (node_id);


--
-- Name: node_tags node_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_tags
    ADD CONSTRAINT node_tags_pkey PRIMARY KEY (node_id, tag);


--
-- Name: node_versions node_versions_node_id_version_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_versions
    ADD CONSTRAINT node_versions_node_id_version_no_key UNIQUE (node_id, version_no);


--
-- Name: node_versions node_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_versions
    ADD CONSTRAINT node_versions_pkey PRIMARY KEY (id);


--
-- Name: nodes nodes_namespace_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nodes
    ADD CONSTRAINT nodes_namespace_slug_key UNIQUE (namespace_id, slug);


--
-- Name: nodes nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nodes
    ADD CONSTRAINT nodes_pkey PRIMARY KEY (id);


--
-- Name: page_layout_presets page_layout_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_layout_presets
    ADD CONSTRAINT page_layout_presets_pkey PRIMARY KEY (id);


--
-- Name: page_locks page_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_locks
    ADD CONSTRAINT page_locks_pkey PRIMARY KEY (page_id);


--
-- Name: page_shares page_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_shares
    ADD CONSTRAINT page_shares_pkey PRIMARY KEY (page_id, user_id);


--
-- Name: page_versions page_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_versions
    ADD CONSTRAINT page_versions_pkey PRIMARY KEY (version_id);


--
-- Name: pages pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_pkey PRIMARY KEY (id);


--
-- Name: paragraph_styles paragraph_styles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paragraph_styles
    ADD CONSTRAINT paragraph_styles_pkey PRIMARY KEY (id);


--
-- Name: property_definitions property_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_definitions
    ADD CONSTRAINT property_definitions_pkey PRIMARY KEY (name);


--
-- Name: property_groups property_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_groups
    ADD CONSTRAINT property_groups_pkey PRIMARY KEY (slug);


--
-- Name: relationship_type_properties relationship_type_properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_type_properties
    ADD CONSTRAINT relationship_type_properties_pkey PRIMARY KEY (relationship_type_slug, property_name);


--
-- Name: relationship_types relationship_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_types
    ADD CONSTRAINT relationship_types_pkey PRIMARY KEY (slug);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: share_links share_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_pkey PRIMARY KEY (id);


--
-- Name: share_links share_links_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_token_hash_key UNIQUE (token_hash);


--
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_pkey PRIMARY KEY (key);


--
-- Name: stylesheets stylesheets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stylesheets
    ADD CONSTRAINT stylesheets_pkey PRIMARY KEY (id);


--
-- Name: themes themes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.themes
    ADD CONSTRAINT themes_pkey PRIMARY KEY (id);


--
-- Name: typography_tokens typography_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.typography_tokens
    ADD CONSTRAINT typography_tokens_pkey PRIMARY KEY (id);


--
-- Name: user_connections user_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_connections
    ADD CONSTRAINT user_connections_pkey PRIMARY KEY (id);


--
-- Name: user_connections user_connections_user_plugin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_connections
    ADD CONSTRAINT user_connections_user_plugin_key UNIQUE (user_id, plugin);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: api_tokens_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_tokens_user_idx ON public.api_tokens USING btree (user_id);


--
-- Name: assets_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assets_owner_idx ON public.assets USING btree (owner_page_id);


--
-- Name: assets_owner_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assets_owner_user_idx ON public.assets USING btree (owner_user_id);


--
-- Name: assets_user_avatar_singleton_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX assets_user_avatar_singleton_idx ON public.assets USING btree (owner_user_id) WHERE ((kind = 'avatar'::text) AND (scope = 'user'::text));


--
-- Name: collections_plugin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collections_plugin_idx ON public.collections USING btree (plugin) WHERE (plugin IS NOT NULL);


--
-- Name: collections_search_tsv_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collections_search_tsv_idx ON public.collections USING gin (search_tsv);


--
-- Name: connection_flows_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX connection_flows_expires_idx ON public.connection_flows USING btree (expires_at);


--
-- Name: custom_styles_sheet_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX custom_styles_sheet_idx ON public.custom_styles USING btree (stylesheet_id, "position");


--
-- Name: custom_styles_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX custom_styles_slug_idx ON public.custom_styles USING btree (slug);


--
-- Name: documents_plugin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_plugin_idx ON public.documents USING btree (plugin) WHERE (plugin IS NOT NULL);


--
-- Name: documents_search_tsv_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_search_tsv_idx ON public.documents USING gin (search_tsv);


--
-- Name: edge_properties_edge_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX edge_properties_edge_idx ON public.edge_properties USING btree (edge_id);


--
-- Name: edge_properties_name_value_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX edge_properties_name_value_idx ON public.edge_properties USING btree (name, value);


--
-- Name: edges_relationship_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX edges_relationship_type_idx ON public.edges USING btree (relationship_type) WHERE (relationship_type IS NOT NULL);


--
-- Name: edges_source_target_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX edges_source_target_type_idx ON public.edges USING btree (source_id, target_id, COALESCE(relationship_type, ''::text));


--
-- Name: edges_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX edges_target_idx ON public.edges USING btree (target_id);


--
-- Name: edges_target_relationship_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX edges_target_relationship_type_idx ON public.edges USING btree (target_id, relationship_type) WHERE (relationship_type IS NOT NULL);


--
-- Name: font_families_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX font_families_name_idx ON public.font_families USING btree (lower(name));


--
-- Name: footer_links_target_page_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX footer_links_target_page_idx ON public.footer_links USING btree (target_page_id);


--
-- Name: namespace_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX namespace_members_user_idx ON public.namespace_members USING btree (user_id);


--
-- Name: namespaces_one_default_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX namespaces_one_default_idx ON public.namespaces USING btree (is_default) WHERE is_default;


--
-- Name: nav_tree_entries_siblings_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nav_tree_entries_siblings_idx ON public.nav_tree_entries USING btree (consumer, parent_id, "position");


--
-- Name: nav_tree_entries_target_page_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nav_tree_entries_target_page_idx ON public.nav_tree_entries USING btree (target_page_id);


--
-- Name: node_classes_one_root_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX node_classes_one_root_idx ON public.node_classes USING btree (kind) WHERE (kind = 'root'::text);


--
-- Name: node_classes_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX node_classes_parent_idx ON public.node_classes USING btree (parent_id);


--
-- Name: node_properties_name_value_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX node_properties_name_value_idx ON public.node_properties USING btree (name, value);


--
-- Name: node_properties_node_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX node_properties_node_idx ON public.node_properties USING btree (node_id);


--
-- Name: node_tags_tag_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX node_tags_tag_idx ON public.node_tags USING btree (tag);


--
-- Name: nodes_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nodes_class_idx ON public.nodes USING btree (class_id);


--
-- Name: nodes_locale_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nodes_locale_idx ON public.nodes USING btree (locale);


--
-- Name: nodes_type_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nodes_type_created_idx ON public.nodes USING btree (type, created_at DESC);


--
-- Name: nodes_type_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nodes_type_updated_idx ON public.nodes USING btree (type, updated_at DESC);


--
-- Name: nodes_visibility_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nodes_visibility_idx ON public.nodes USING btree (visibility);


--
-- Name: page_layout_presets_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX page_layout_presets_scope_idx ON public.page_layout_presets USING btree (scope_kind, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), "position");


--
-- Name: page_shares_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX page_shares_user_idx ON public.page_shares USING btree (user_id);


--
-- Name: pages_search_tsv_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pages_search_tsv_idx ON public.pages USING gin (search_tsv);


--
-- Name: paragraph_styles_default_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX paragraph_styles_default_idx ON public.paragraph_styles USING btree (render_as) WHERE is_default;


--
-- Name: relationship_type_properties_property_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX relationship_type_properties_property_idx ON public.relationship_type_properties USING btree (property_name);


--
-- Name: sessions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user_idx ON public.sessions USING btree (user_id);


--
-- Name: share_links_node_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX share_links_node_idx ON public.share_links USING btree (node_id);


--
-- Name: stylesheets_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stylesheets_scope_idx ON public.stylesheets USING btree (scope_kind, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), "position");


--
-- Name: themes_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX themes_scope_idx ON public.themes USING btree (scope_kind, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));


--
-- Name: typography_tokens_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX typography_tokens_name_idx ON public.typography_tokens USING btree (lower(name));


--
-- Name: user_connections_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_connections_active_idx ON public.user_connections USING btree (plugin) WHERE (status = 'active'::text);


--
-- Name: api_tokens api_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: asset_variants asset_variants_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_variants
    ADD CONSTRAINT asset_variants_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: assets assets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: assets assets_owner_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_owner_page_id_fkey FOREIGN KEY (owner_page_id) REFERENCES public.pages(id) ON DELETE CASCADE;


--
-- Name: assets assets_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: collections collections_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_id_fkey FOREIGN KEY (id) REFERENCES public.nodes(id) ON DELETE CASCADE;


--
-- Name: connection_flows connection_flows_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connection_flows
    ADD CONSTRAINT connection_flows_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: connection_flows connection_flows_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connection_flows
    ADD CONSTRAINT connection_flows_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: custom_styles custom_styles_stylesheet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_styles
    ADD CONSTRAINT custom_styles_stylesheet_id_fkey FOREIGN KEY (stylesheet_id) REFERENCES public.stylesheets(id) ON DELETE CASCADE;


--
-- Name: document_shares document_shares_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_shares
    ADD CONSTRAINT document_shares_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_shares document_shares_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_shares
    ADD CONSTRAINT document_shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: documents documents_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_id_fkey FOREIGN KEY (id) REFERENCES public.nodes(id) ON DELETE CASCADE;


--
-- Name: edge_properties edge_properties_edge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.edge_properties
    ADD CONSTRAINT edge_properties_edge_id_fkey FOREIGN KEY (edge_id) REFERENCES public.edges(id) ON DELETE CASCADE;


--
-- Name: edges edges_relationship_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.edges
    ADD CONSTRAINT edges_relationship_type_fkey FOREIGN KEY (relationship_type) REFERENCES public.relationship_types(slug) ON DELETE RESTRICT;


--
-- Name: edges edges_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.edges
    ADD CONSTRAINT edges_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.nodes(id) ON DELETE CASCADE;


--
-- Name: edges edges_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.edges
    ADD CONSTRAINT edges_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.nodes(id) ON DELETE CASCADE;


--
-- Name: font_families font_families_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.font_families
    ADD CONSTRAINT font_families_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: font_variants font_variants_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.font_variants
    ADD CONSTRAINT font_variants_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: font_variants font_variants_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.font_variants
    ADD CONSTRAINT font_variants_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.font_families(id) ON DELETE CASCADE;


--
-- Name: footer_links footer_links_target_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.footer_links
    ADD CONSTRAINT footer_links_target_page_id_fkey FOREIGN KEY (target_page_id) REFERENCES public.pages(id) ON DELETE CASCADE;


--
-- Name: namespace_members namespace_members_namespace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.namespace_members
    ADD CONSTRAINT namespace_members_namespace_id_fkey FOREIGN KEY (namespace_id) REFERENCES public.namespaces(id) ON DELETE CASCADE;


--
-- Name: namespace_members namespace_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.namespace_members
    ADD CONSTRAINT namespace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: nav_tree_entries nav_tree_entries_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nav_tree_entries
    ADD CONSTRAINT nav_tree_entries_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.nav_tree_entries(id) ON DELETE CASCADE;


--
-- Name: nav_tree_entries nav_tree_entries_target_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nav_tree_entries
    ADD CONSTRAINT nav_tree_entries_target_page_id_fkey FOREIGN KEY (target_page_id) REFERENCES public.pages(id) ON DELETE CASCADE;


--
-- Name: node_classes node_classes_overview_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_classes
    ADD CONSTRAINT node_classes_overview_node_id_fkey FOREIGN KEY (overview_node_id) REFERENCES public.nodes(id) ON DELETE SET NULL;


--
-- Name: node_classes node_classes_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_classes
    ADD CONSTRAINT node_classes_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.node_classes(id) ON DELETE RESTRICT;


--
-- Name: node_classes node_classes_parent_kind_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_classes
    ADD CONSTRAINT node_classes_parent_kind_fkey FOREIGN KEY (parent_id, parent_kind) REFERENCES public.node_classes(id, kind);


--
-- Name: node_classes node_classes_parent_node_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_classes
    ADD CONSTRAINT node_classes_parent_node_type_fkey FOREIGN KEY (parent_id, parent_node_type) REFERENCES public.node_classes(id, node_type);


--
-- Name: node_classes node_classes_property_group_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_classes
    ADD CONSTRAINT node_classes_property_group_fkey FOREIGN KEY (property_group) REFERENCES public.property_groups(slug) ON DELETE RESTRICT;


--
-- Name: node_properties node_properties_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_properties
    ADD CONSTRAINT node_properties_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(id) ON DELETE CASCADE;


--
-- Name: node_source_secrets node_source_secrets_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_source_secrets
    ADD CONSTRAINT node_source_secrets_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(id) ON DELETE CASCADE;


--
-- Name: node_tags node_tags_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_tags
    ADD CONSTRAINT node_tags_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(id) ON DELETE CASCADE;


--
-- Name: node_versions node_versions_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_versions
    ADD CONSTRAINT node_versions_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id);


--
-- Name: node_versions node_versions_base_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_versions
    ADD CONSTRAINT node_versions_base_version_id_fkey FOREIGN KEY (base_version_id) REFERENCES public.node_versions(id) ON DELETE SET NULL;


--
-- Name: node_versions node_versions_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_versions
    ADD CONSTRAINT node_versions_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(id) ON DELETE CASCADE;


--
-- Name: nodes nodes_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nodes
    ADD CONSTRAINT nodes_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.node_classes(id) ON DELETE RESTRICT;


--
-- Name: nodes nodes_class_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nodes
    ADD CONSTRAINT nodes_class_type_fkey FOREIGN KEY (class_id, type) REFERENCES public.node_classes(id, node_type);


--
-- Name: nodes nodes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nodes
    ADD CONSTRAINT nodes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: nodes nodes_namespace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nodes
    ADD CONSTRAINT nodes_namespace_id_fkey FOREIGN KEY (namespace_id) REFERENCES public.namespaces(id);


--
-- Name: page_layout_presets page_layout_presets_scope_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_layout_presets
    ADD CONSTRAINT page_layout_presets_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES public.namespaces(id) ON DELETE CASCADE;


--
-- Name: page_locks page_locks_locked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_locks
    ADD CONSTRAINT page_locks_locked_by_fkey FOREIGN KEY (locked_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: page_locks page_locks_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_locks
    ADD CONSTRAINT page_locks_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.pages(id) ON DELETE CASCADE;


--
-- Name: page_shares page_shares_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_shares
    ADD CONSTRAINT page_shares_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.pages(id) ON DELETE CASCADE;


--
-- Name: page_shares page_shares_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_shares
    ADD CONSTRAINT page_shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: page_versions page_versions_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_versions
    ADD CONSTRAINT page_versions_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.node_versions(id) ON DELETE CASCADE;


--
-- Name: pages pages_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_id_fkey FOREIGN KEY (id) REFERENCES public.nodes(id) ON DELETE CASCADE;


--
-- Name: paragraph_styles paragraph_styles_token_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paragraph_styles
    ADD CONSTRAINT paragraph_styles_token_id_fkey FOREIGN KEY (token_id) REFERENCES public.typography_tokens(id) ON DELETE SET NULL;


--
-- Name: property_definitions property_definitions_group_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_definitions
    ADD CONSTRAINT property_definitions_group_slug_fkey FOREIGN KEY (group_slug) REFERENCES public.property_groups(slug) ON DELETE RESTRICT;


--
-- Name: relationship_type_properties relationship_type_properties_property_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_type_properties
    ADD CONSTRAINT relationship_type_properties_property_name_fkey FOREIGN KEY (property_name) REFERENCES public.property_definitions(name) ON DELETE CASCADE;


--
-- Name: relationship_type_properties relationship_type_properties_relationship_type_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_type_properties
    ADD CONSTRAINT relationship_type_properties_relationship_type_slug_fkey FOREIGN KEY (relationship_type_slug) REFERENCES public.relationship_types(slug) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: share_links share_links_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: share_links share_links_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(id) ON DELETE CASCADE;


--
-- Name: stylesheets stylesheets_scope_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stylesheets
    ADD CONSTRAINT stylesheets_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES public.namespaces(id) ON DELETE CASCADE;


--
-- Name: themes themes_scope_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.themes
    ADD CONSTRAINT themes_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES public.namespaces(id) ON DELETE CASCADE;


--
-- Name: typography_tokens typography_tokens_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.typography_tokens
    ADD CONSTRAINT typography_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: user_connections user_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_connections
    ADD CONSTRAINT user_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


