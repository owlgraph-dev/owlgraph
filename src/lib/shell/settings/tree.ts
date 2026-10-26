// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Message functions are stored, never called here: the locale resolves per
// render. This only decides what is shown; each route's adapter enforces the
// same action with requireAction (docs/architecture/settings.md).
import * as m from '$lib/paraglide/messages';
import { PLUGINS_WITH_CONNECTIONS, PLUGINS_WITH_SETTINGS } from '$lib/plugins';
import type { SettingsGroup, SettingsItem } from './treeModel';

// The group is absent while no plugin declares settings.
const INTEGRATION_ITEMS: SettingsItem[] = PLUGINS_WITH_SETTINGS.map((plugin) => ({
  id: `integration-${plugin.id}`,
  href: `/settings/integrations/${plugin.id}`,
  action: 'integration:manage',
  label: plugin.label,
  description: plugin.settings.intro,
  keywords: m.settings_item_integration_kw,
}));

// A personal section while some plugin offers connections (docs/architecture/plugins.md, "Connections").
const CONNECTION_ITEMS: SettingsItem[] =
  PLUGINS_WITH_CONNECTIONS.length > 0
    ? [{ id: 'connections', href: '/settings/connections', action: null, label: m.settings_item_connections_label, description: m.settings_item_connections_desc, keywords: m.settings_item_connections_kw }]
    : [];

export const OVERVIEW: SettingsItem = {
  id: 'overview',
  href: '/settings',
  action: null,
  label: m.settings_overview,
  description: m.settings_overview_intro,
  keywords: () => '',
};

export const SETTINGS_TREE: SettingsGroup[] = [
  {
    id: 'personal',
    label: m.settings_group_personal,
    items: [
      { id: 'profile', href: '/settings/profile', action: null, label: m.settings_item_profile_label, description: m.settings_item_profile_desc, keywords: m.settings_item_profile_kw },
      { id: 'api-tokens', href: '/settings/api-tokens', action: null, label: m.settings_item_api_tokens_label, description: m.settings_item_api_tokens_desc, keywords: m.settings_item_api_tokens_kw },
      ...CONNECTION_ITEMS,
    ],
  },
  {
    id: 'general',
    label: m.settings_group_general,
    items: [
      { id: 'languages', href: '/settings/languages', action: 'locale:manage', label: m.settings_item_languages_label, description: m.settings_item_languages_desc, keywords: m.settings_item_languages_kw },
      // A public page outside the settings, listed for the admins, who see how
      // the installation runs on it.
      { id: 'about', href: '/-/about', action: 'installation:view', label: m.settings_item_about_label, description: m.settings_item_about_desc, keywords: m.settings_item_about_kw },
    ],
  },
  {
    id: 'content',
    label: m.settings_group_content,
    items: [
      { id: 'navigation', href: '/settings/navigation', action: 'navigation:manage', label: m.settings_item_navigation_label, description: m.settings_item_navigation_desc, keywords: m.settings_item_navigation_kw },
      { id: 'home', href: '/settings/home', action: 'homepage:manage', label: m.settings_item_home_label, description: m.settings_item_home_desc, keywords: m.settings_item_home_kw },
      { id: 'footer', href: '/settings/footer', action: 'footer:manage', label: m.settings_item_footer_label, description: m.settings_item_footer_desc, keywords: m.settings_item_footer_kw },
    ],
  },
  {
    id: 'appearance',
    label: m.settings_group_appearance,
    items: [
      { id: 'branding', href: '/settings/branding', action: 'branding:manage', label: m.settings_item_branding_label, description: m.settings_item_branding_desc, keywords: m.settings_item_branding_kw },
      { id: 'color-scheme', href: '/settings/color-scheme', action: 'branding:manage', label: m.settings_item_color_scheme_label, description: m.settings_item_color_scheme_desc, keywords: m.settings_item_color_scheme_kw },
      { id: 'fonts', href: '/settings/fonts', action: 'font:manage', label: m.settings_item_fonts_label, description: m.settings_item_fonts_desc, keywords: m.settings_item_fonts_kw },
      { id: 'styles', href: '/settings/styles', action: 'stylesheet:manage', label: m.settings_item_styles_label, description: m.settings_item_styles_desc, keywords: m.settings_item_styles_kw },
      { id: 'page-layouts', href: '/settings/page-layouts', action: 'page-layout:manage', label: m.settings_item_page_layouts_label, description: m.settings_item_page_layouts_desc, keywords: m.settings_item_page_layouts_kw },
    ],
  },
  {
    id: 'structure',
    label: m.settings_group_structure,
    items: [
      { id: 'namespaces', href: '/settings/namespaces', action: 'namespace:manage', label: m.settings_item_namespaces_label, description: m.settings_item_namespaces_desc, keywords: m.settings_item_namespaces_kw },
    ],
  },
  {
    id: 'schema',
    label: m.settings_group_schema,
    items: [
      { id: 'schema-properties', href: '/settings/schema/properties', action: 'property:manage', label: m.settings_item_schema_properties_label, description: m.settings_item_schema_properties_desc, keywords: m.settings_item_schema_properties_kw },
      { id: 'schema-groups', href: '/settings/schema/groups', action: 'property-group:manage', label: m.settings_item_schema_groups_label, description: m.settings_item_schema_groups_desc, keywords: m.settings_item_schema_groups_kw },
      { id: 'schema-relationships', href: '/settings/schema/relationships', action: 'relationship:manage', label: m.settings_item_schema_relationships_label, description: m.settings_item_schema_relationships_desc, keywords: m.settings_item_schema_relationships_kw },
      { id: 'schema-classes', href: '/settings/schema/classes', action: 'class:manage', label: m.settings_item_schema_classes_label, description: m.settings_item_schema_classes_desc, keywords: m.settings_item_schema_classes_kw },
    ],
  },
  {
    id: 'access',
    label: m.settings_group_access,
    items: [
      { id: 'users', href: '/settings/users', action: 'user:manage', label: m.settings_item_users_label, description: m.settings_item_users_desc, keywords: m.settings_item_users_kw },
    ],
  },
  ...(INTEGRATION_ITEMS.length > 0 ? [{ id: 'integrations', label: m.settings_group_integrations, items: INTEGRATION_ITEMS }] : []),
];
