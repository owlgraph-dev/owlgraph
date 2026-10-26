// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The HTTP API's errors (docs/architecture/routing.md, "Errors"): one body,
// `{ error: { code, message, …details } }`. The code is the contract and the
// only thing a client branches on; the message is one sentence for a person, in
// the request's interface language, built here from the code. No adapter writes
// an error body of its own. Kept free of @sveltejs/kit, so the agents' server
// answers with it too.
import * as m from '$lib/paraglide/messages';
import { isCodedError } from './codedError';

type Details = Record<string, unknown>;
type Locale = Parameters<typeof m.api_error_internal>[1];

interface ApiErrorKind {
  status: number;
  /** The sentence a person reads, from the details the code carries. */
  message: (details: Details, options: Locale) => string;
  /** The details a client may read, beside the code. Anything else in `details` only words the message. */
  fields?: readonly string[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''));
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));

const NOT_FOUND: Record<string, (o: Locale) => string> = {
  page: (o) => m.api_error_not_found_page({}, o),
  document: (o) => m.api_error_not_found_document({}, o),
  collection: (o) => m.api_error_not_found_collection({}, o),
};

// A translated field left blank in the site's default language: `field` is the
// form's input, `what` words the sentence.
const DEFAULT_TEXT: Record<string, (p: { locale: string }, o: Locale) => string> = {
  label: m.api_error_default_text_required_label,
  description: m.api_error_default_text_required_description,
  name: m.api_error_default_text_required_name,
  'inverse label': m.api_error_default_text_required_inverse_label,
};

export const API_ERRORS = {
  unauthorized: { status: 401, message: (_, o) => m.api_error_unauthorized({}, o) },
  // The agents' server: no bearer token, or one that names nobody.
  token_required: { status: 401, message: (_, o) => m.api_error_token_required({}, o) },
  forbidden: { status: 403, message: (_, o) => m.api_error_forbidden({}, o) },
  // Missing and unreadable alike (docs/architecture/authorization.md): `kind` words the sentence.
  not_found: { status: 404, message: (d, o) => (NOT_FOUND[str(d.kind)] ?? ((x: Locale) => m.api_error_not_found({}, x)))(o) },
  method_not_allowed: { status: 405, message: (_, o) => m.api_error_method_not_allowed({}, o) },
  rate_limited: { status: 429, message: (_, o) => m.api_error_rate_limited({}, o) },
  invalid_json: { status: 400, message: (_, o) => m.api_error_invalid_json({}, o) },
  json_required: { status: 415, message: (_, o) => m.api_error_json_required({}, o) },
  unsupported_media_type: { status: 415, message: (_, o) => m.api_error_unsupported_media_type({}, o) },
  invalid_request: {
    status: 400,
    message: (d, o) => (d.field ? m.api_error_invalid_request_field({ field: str(d.field) }, o) : m.api_error_invalid_request({}, o)),
    fields: ['field'],
  },
  too_large: {
    status: 413,
    message: (d, o) => (typeof d.limit === 'number' ? m.api_error_too_large_limit({ limit: d.limit }, o) : m.api_error_too_large({}, o)),
    fields: ['limit'],
  },
  file_required: { status: 400, message: (_, o) => m.api_error_file_required({}, o) },
  unsupported_file_type: {
    status: 415,
    message: (d, o) => (d.type ? m.api_error_unsupported_file_type_named({ type: str(d.type) }, o) : m.api_error_unsupported_file_type({}, o)),
    fields: ['type'],
  },
  invalid_file_content: { status: 415, message: (_, o) => m.api_error_invalid_file_content({}, o) },
  invalid_image: { status: 415, message: (_, o) => m.api_error_invalid_image({}, o) },
  unsupported_width: { status: 400, message: (_, o) => m.api_error_unsupported_width({}, o) },
  invalid_address: { status: 400, message: (_, o) => m.api_error_invalid_address({}, o), fields: ['reason'] },
  slug_taken: { status: 409, message: (_, o) => m.api_error_slug_taken({}, o) },
  slug_reserved: { status: 400, message: (_, o) => m.api_error_slug_reserved({}, o) },
  slug_required: { status: 400, message: (_, o) => m.api_error_slug_required({}, o) },
  title_required: { status: 400, message: (_, o) => m.api_error_title_required({}, o) },
  unknown_namespace: { status: 400, message: (_, o) => m.api_error_unknown_namespace({}, o) },
  namespace_membership_required: { status: 403, message: (_, o) => m.api_error_namespace_membership_required({}, o) },
  widening_not_allowed: { status: 409, message: (_, o) => m.api_error_widening_not_allowed({}, o) },
  invalid_visibility: { status: 400, message: (_, o) => m.api_error_invalid_visibility({}, o) },
  locale_not_enabled: { status: 400, message: (_, o) => m.api_error_locale_not_enabled({}, o) },
  unknown_locale: { status: 400, message: (_, o) => m.api_error_unknown_locale({}, o) },
  class_not_found: { status: 400, message: (_, o) => m.api_error_class_not_found({}, o) },
  class_not_assignable: { status: 400, message: (_, o) => m.api_error_class_not_assignable({}, o) },
  class_type_mismatch: { status: 400, message: (_, o) => m.api_error_class_type_mismatch({}, o) },
  lock_lost: { status: 423, message: (_, o) => m.api_error_lock_lost({}, o), fields: ['status'] },
  unknown_blocks_dropped: { status: 409, message: (_, o) => m.api_error_unknown_blocks_dropped({}, o), fields: ['dropped'] },
  home_page: { status: 409, message: (_, o) => m.api_error_home_page({}, o) },
  invalid_content_scheme: { status: 400, message: (_, o) => m.api_error_invalid_content_scheme({}, o) },
  source_fixed: { status: 409, message: (_, o) => m.api_error_source_fixed({}, o) },
  no_source: { status: 409, message: (_, o) => m.api_error_no_source({}, o) },
  plugin_document: { status: 400, message: (_, o) => m.api_error_plugin_document({}, o) },
  mirrored: { status: 409, message: (_, o) => m.api_error_mirrored({}, o) },
  member_not_found: { status: 404, message: (_, o) => m.api_error_member_not_found({}, o) },
  self_member: { status: 409, message: (_, o) => m.api_error_self_member({}, o) },
  cycle: { status: 409, message: (_, o) => m.api_error_cycle({}, o) },
  too_deep: { status: 409, message: (_, o) => m.api_error_too_deep({}, o) },
  stale_order: { status: 409, message: (_, o) => m.api_error_stale_order({}, o) },
  invalid_order: { status: 400, message: (_, o) => m.api_error_invalid_order({}, o) },
  invalid_label: { status: 400, message: (_, o) => m.api_error_invalid_label({}, o) },
  plugin_disabled: { status: 409, message: (_, o) => m.api_error_plugin_disabled({}, o) },
  secret_key_missing: { status: 503, message: (_, o) => m.api_error_secret_key_missing({}, o) },
  upstream_unreachable: { status: 502, message: (_, o) => m.api_error_upstream_unreachable({}, o) },
  upstream_refused: { status: 502, message: (_, o) => m.api_error_upstream_refused({}, o) },
  grant_expired: { status: 410, message: (_, o) => m.integration_grant_expired({}, o) },
  connection_renew: { status: 403, message: (_, o) => m.integration_grant_renew({}, o) },
  internal: { status: 500, message: (_, o) => m.api_error_internal({}, o), fields: ['id'] },
  // The settings pages' refusals (a form action's, through formError).
  weak_password: {
    status: 400,
    message: (d, o) =>
      d.problem === 'too-long'
        ? m.settings_users_error_password_too_long({ max: num(d.max) }, o)
        : d.problem === 'too-common'
          ? m.settings_users_error_password_too_common({}, o)
          : m.settings_users_error_password_too_short({ min: num(d.min) }, o),
    fields: ['problem'],
  },
  credentials_required: { status: 400, message: (_, o) => m.login_error_required({}, o) },
  invalid_credentials: { status: 400, message: (_, o) => m.login_error_invalid({}, o) },
  image_required: { status: 400, message: (_, o) => m.form_choose_image({}, o) },
  invalid_role: { status: 400, message: (_, o) => m.settings_users_error_role({}, o) },
  email_taken: { status: 409, message: (_, o) => m.settings_users_error_exists({}, o) },
  own_admin_role: { status: 400, message: (_, o) => m.settings_users_error_own_admin_role({}, o) },
  own_deactivate: { status: 400, message: (_, o) => m.settings_users_error_own_deactivate({}, o) },
  family_name_required: { status: 400, message: (_, o) => m.settings_fonts_error_name_required({}, o) },
  font_file_required: { status: 400, message: (_, o) => m.settings_fonts_error_file_required({}, o) },
  invalid_access_level: { status: 400, message: (_, o) => m.settings_namespaces_error_access_level({}, o) },
  invalid_block_defaults: { status: 400, message: (_, o) => m.settings_branding_block_defaults_error_invalid({}, o) },
  invalid_tag: { status: 400, message: (_, o) => m.settings_branding_paragraph_styles_error_tag({}, o) },
  entry_not_found: { status: 404, message: (_, o) => m.settings_footer_error_entry_not_found({}, o) },
  invalid_svg: { status: 415, message: (_, o) => m.api_error_invalid_svg({}, o) },
  invalid_family_name: { status: 400, message: (_, o) => m.api_error_invalid_family_name({}, o) },
  invalid_font_file: { status: 415, message: (_, o) => m.api_error_invalid_font_file({}, o) },
  invalid_font_weight: { status: 400, message: (_, o) => m.api_error_invalid_font_weight({}, o) },
  invalid_font_style: { status: 400, message: (_, o) => m.api_error_invalid_font_style({}, o) },
  font_variant_taken: { status: 409, message: (_, o) => m.api_error_font_variant_taken({}, o) },
  name_required: { status: 400, message: (_, o) => m.api_error_name_required({}, o) },
  label_required: { status: 400, message: (_, o) => m.api_error_label_required({}, o) },
  too_long: { status: 400, message: (d, o) => m.api_error_too_long({ max: num(d.max) }, o), fields: ['max'] },
  namespace_slug_required: { status: 400, message: (_, o) => m.api_error_namespace_slug_required({}, o) },
  namespace_slug_reserved: { status: 400, message: (_, o) => m.api_error_slug_reserved({}, o) },
  namespace_slug_taken: { status: 409, message: (_, o) => m.api_error_namespace_slug_taken({}, o) },
  default_namespace_has_no_url: { status: 400, message: (_, o) => m.api_error_default_namespace_has_no_url({}, o) },
  default_namespace_undeletable: { status: 409, message: (_, o) => m.api_error_default_namespace_undeletable({}, o) },
  theme_colors_unreadable: { status: 400, message: (_, o) => m.api_error_theme_colors_unreadable({}, o) },
  invalid_key: { status: 400, message: (_, o) => m.api_error_invalid_key({}, o) },
  reserved_key: { status: 400, message: (_, o) => m.api_error_reserved_key({}, o) },
  reserved_group: { status: 400, message: (_, o) => m.api_error_reserved_group({}, o) },
  group_not_empty: { status: 409, message: (_, o) => m.api_error_group_not_empty({}, o) },
  group_not_found: { status: 400, message: (_, o) => m.api_error_group_not_found({}, o) },
  node_not_found: { status: 400, message: (_, o) => m.api_error_node_not_found({}, o) },
  relationship_type_in_use: { status: 409, message: (_, o) => m.api_error_relationship_type_in_use({}, o) },
  class_protected: { status: 409, message: (_, o) => m.api_error_class_protected({}, o) },
  parent_required: { status: 400, message: (_, o) => m.api_error_parent_required({}, o) },
  parent_invalid: { status: 400, message: (_, o) => m.api_error_parent_invalid({}, o) },
  class_slug_taken: { status: 409, message: (_, o) => m.api_error_class_slug_taken({}, o) },
  class_reparent_blocked: { status: 409, message: (_, o) => m.api_error_class_reparent_blocked({}, o) },
  class_cycle: { status: 409, message: (_, o) => m.api_error_class_cycle({}, o) },
  class_in_use: { status: 409, message: (_, o) => m.api_error_class_in_use({}, o) },
  class_has_children: { status: 409, message: (_, o) => m.api_error_class_has_children({}, o) },
  invalid_css: { status: 400, message: (_, o) => m.api_error_invalid_css({}, o) },
  invalid_style_kind: { status: 400, message: (_, o) => m.api_error_invalid_style_kind({}, o) },
  no_free_class_name: { status: 409, message: (_, o) => m.api_error_no_free_class_name({}, o) },
  invalid_token_name: { status: 400, message: (d, o) => m.api_error_invalid_token_name({ max: num(d.max) }, o), fields: ['max'] },
  invalid_size: { status: 400, message: (_, o) => m.api_error_invalid_size({}, o) },
  invalid_weight: { status: 400, message: (_, o) => m.api_error_invalid_weight({}, o) },
  invalid_line_height: { status: 400, message: (_, o) => m.api_error_invalid_line_height({}, o) },
  invalid_letter_spacing: { status: 400, message: (_, o) => m.api_error_invalid_letter_spacing({}, o) },
  invalid_style_name: { status: 400, message: (d, o) => m.api_error_invalid_style_name({ max: num(d.max) }, o), fields: ['max'] },
  style_name_taken: { status: 409, message: (_, o) => m.api_error_style_name_taken({}, o) },
  default_style_undeletable: { status: 409, message: (_, o) => m.api_error_default_style_undeletable({}, o) },
  page_required: { status: 400, message: (_, o) => m.api_error_page_required({}, o) },
  url_required: { status: 400, message: (_, o) => m.api_error_url_required({}, o) },
  invalid_target: { status: 400, message: (_, o) => m.api_error_invalid_target({}, o) },
  invalid_parent: { status: 400, message: (_, o) => m.api_error_invalid_parent({}, o) },
  nest_top_level_only: { status: 400, message: (_, o) => m.api_error_nest_top_level_only({}, o) },
  nest_below_group: { status: 400, message: (_, o) => m.api_error_nest_below_group({}, o) },
  already_top_level: { status: 400, message: (_, o) => m.api_error_already_top_level({}, o) },
  invalid_columns: { status: 400, message: (_, o) => m.api_error_invalid_columns({}, o) },
  invalid_gap: { status: 400, message: (_, o) => m.api_error_invalid_gap({}, o) },
  layout_name_taken: { status: 409, message: (_, o) => m.api_error_layout_name_taken({}, o) },
  no_free_id: { status: 409, message: (_, o) => m.api_error_no_free_id({}, o) },
  standard_always_available: { status: 409, message: (_, o) => m.api_error_standard_always_available({}, o) },
  standard_undeletable: { status: 409, message: (_, o) => m.api_error_standard_undeletable({}, o) },
  language_required: { status: 400, message: (_, o) => m.api_error_language_required({}, o) },
  default_language_disabled: { status: 400, message: (_, o) => m.api_error_default_language_disabled({}, o) },
  invalid_translations: { status: 400, message: (d, o) => m.api_error_invalid_translations({ languages: str(d.languages) }, o) },
  default_text_required: {
    status: 400,
    message: (d, o) => (DEFAULT_TEXT[str(d.what)] ?? m.api_error_default_text_required)({ locale: str(d.locale) }, o),
    fields: ['field', 'locale'],
  },
} as const satisfies Record<string, ApiErrorKind>;

export type ApiErrorCode = keyof typeof API_ERRORS;

export function isApiErrorCode(code: unknown): code is ApiErrorCode {
  return typeof code === 'string' && Object.hasOwn(API_ERRORS, code);
}

export interface ApiErrorBody {
  error: { code: string; message: string } & Details;
}

/** The status and body of a code's error, its message in `locale` or the request's language. */
export function apiErrorBody(code: ApiErrorCode, details: Details = {}, locale?: string): { status: number; body: ApiErrorBody } {
  const kind: ApiErrorKind = API_ERRORS[code];
  const options = (locale ? { locale } : undefined) as Locale;
  const fields = Object.fromEntries((kind.fields ?? []).filter((key) => details[key] !== undefined).map((key) => [key, details[key]]));
  return { status: kind.status, body: { error: { code, message: kind.message(details, options), ...fields } } };
}

const JSON_HEADERS = { 'content-type': 'application/json' };

/** The response of a code's error. `init` may add headers (retry-after, cache-control). */
export function apiError(code: ApiErrorCode, details: Details = {}, init: { headers?: Record<string, string>; locale?: string } = {}): Response {
  const { status, body } = apiErrorBody(code, details, init.locale);
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...init.headers } });
}

/** A model's refusal as its response; anything else is rethrown, to the 500 path. */
export function apiErrorFrom(e: unknown, details: Details = {}): Response {
  if (isCodedError(e) && isApiErrorCode(e.code)) return apiError(e.code, { ...e.details, ...details });
  throw e;
}

/**
 * A byte route's error (media, fonts, the site stylesheet, a document's
 * content): people's browsers open those addresses, so it is a status and the
 * sentence alone, as text.
 */
export function textError(code: ApiErrorCode, details: Details = {}, init: { headers?: Record<string, string> } = {}): Response {
  const { status, body } = apiErrorBody(code, details);
  return new Response(body.error.message, { status, headers: { 'content-type': 'text/plain; charset=utf-8', ...init.headers } });
}

/**
 * A plugin's own refusal on its own routes (docs/architecture/plugins.md, "Routes"): the
 * same body, under a code of the plugin's and a sentence from its dictionary.
 */
export function pluginError(status: number, code: string, message: string, init: { headers?: Record<string, string> } = {}): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...init.headers } });
}
