// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The schema catalogues' query fields and NodeProperty; the host schema registers them.
import { GraphQLError } from 'graphql';
import { builder, NodeTypeEnum } from '$lib/features/query/graphql/builder.server';
import { can } from '$lib/features/auth/server';
import { getPropertySuggestions, listRelationshipTypes, listNodeClasses, listTags, type RelationshipType, type PropertySuggestionRow, type NodeClassListRow } from '$lib/features/semantic/server';
import { locales, type Locale } from '$lib/paraglide/runtime';
import { localize, hasText, type LocalizedText } from '$lib/platform/i18n/localizedText';
import { SUPPORTED_LOCALES } from '$lib/platform/i18n/siteLocales';
import type { NodeType } from '$lib/features/nodes';

// Every label comes twice: `label(locale)`, one string by the fallback chain,
// and `labels`, every translation (docs/architecture/languages.md). Identifiers never localize.
export const LocaleType = builder.enumType('Locale', {
  description: 'A configured locale (EN = en, DE = de).',
  values: Object.fromEntries(locales.map((locale) => [locale.toUpperCase(), { value: locale }])) as Record<string, { value: Locale }>,
});

const LocalizedStringType = builder.objectRef<{ locale: Locale; text: string }>('LocalizedString').implement({
  description: 'One translation of a schema label or description.',
  fields: (t) => ({
    locale: t.field({ type: LocaleType, resolve: (s) => s.locale }),
    text: t.exposeString('text'),
  }),
});

function translations(text: LocalizedText | null | undefined): { locale: Locale; text: string }[] {
  if (!text) return [];
  return SUPPORTED_LOCALES.flatMap((locale) => {
    const value = text[locale]?.trim();
    return value ? [{ locale, text: value }] : [];
  });
}

const LOCALE_ARG_DESCRIPTION = "The locale to resolve for; the request's interface language (the viewer's chosen language, else Accept-Language among the enabled languages, else the site default language) when omitted.";

const PropertyDefinitionType = builder.objectRef<PropertySuggestionRow>('PropertyDefinition').implement({
  description:
    'A discoverable property — either registered in property_definitions (label/datatype set) or an ad hoc name in use on the nodes you may read (no translations, label resolves to the name, datatype empty, treated as "text").',
  fields: (t) => ({
    name: t.exposeString('name'),
    label: t.string({
      args: { locale: t.arg({ type: LocaleType, description: LOCALE_ARG_DESCRIPTION }) },
      resolve: (d, { locale }) => localize(d.label, d.name, locale ?? undefined),
    }),
    labels: t.field({ type: [LocalizedStringType], resolve: (d) => translations(d.label) }),
    datatype: t.exposeString('datatype')
  })
});

const RelationshipTypeType = builder.objectRef<RelationshipType>('RelationshipType').implement({
  description: 'A controlled relationship type (managed under Settings, see /settings/schema/relationships) — the typed-edge analogue of a property definition.',
  fields: (t) => ({
    slug: t.exposeString('slug'),
    label: t.string({
      args: { locale: t.arg({ type: LocaleType, description: LOCALE_ARG_DESCRIPTION }) },
      resolve: (r, { locale }) => localize(r.label, r.slug, locale ?? undefined),
    }),
    labels: t.field({ type: [LocalizedStringType], resolve: (r) => translations(r.label) }),
    description: t.string({
      args: { locale: t.arg({ type: LocaleType, description: LOCALE_ARG_DESCRIPTION }) },
      resolve: (r, { locale }) => localize(r.description, '', locale ?? undefined),
    }),
    descriptions: t.field({ type: [LocalizedStringType], resolve: (r) => translations(r.description) }),
    inverseLabel: t.string({
      nullable: true,
      description: 'The edge read from its target (e.g. "is authored by"); null when the type has none.',
      args: { locale: t.arg({ type: LocaleType, description: LOCALE_ARG_DESCRIPTION }) },
      resolve: (r, { locale }) => (hasText(r.inverse_label) ? localize(r.inverse_label, '', locale ?? undefined) : null),
    }),
    inverseLabels: t.field({ type: [LocalizedStringType], resolve: (r) => translations(r.inverse_label) })
  })
});

// Global vocabulary, so no viewer scoping.
const NodeClassKindType = builder.enumType('NodeClassKind', {
  description: 'Where a class sits in the hierarchy: TYPE is a node type (page/document — the level that carries editor/view/routing), DOMAIN a semantic class below one.',
  values: { TYPE: { value: 'type' }, DOMAIN: { value: 'domain' } } as const
});

const NodeClassType = builder.objectRef<NodeClassListRow>('NodeClass').implement({
  description: 'A class in the single-parent class hierarchy (managed under Settings, see /settings/schema/classes): node (root) → node types (page, document) → domain classes. Every node carries exactly one class, at least its node type. Filter by it with an IntrinsicCondition on CLASS_ID using the class\'s `id`.',
  fields: (t) => ({
    id: t.exposeID('id'),
    slug: t.exposeString('slug'),
    label: t.string({
      args: { locale: t.arg({ type: LocaleType, description: LOCALE_ARG_DESCRIPTION }) },
      resolve: (c, { locale }) => localize(c.label, c.slug, locale ?? undefined),
    }),
    labels: t.field({ type: [LocalizedStringType], resolve: (c) => translations(c.label) }),
    description: t.string({
      args: { locale: t.arg({ type: LocaleType, description: LOCALE_ARG_DESCRIPTION }) },
      resolve: (c, { locale }) => localize(c.description, '', locale ?? undefined),
    }),
    descriptions: t.field({ type: [LocalizedStringType], resolve: (c) => translations(c.description) }),
    kind: t.field({ type: NodeClassKindType, resolve: (c) => c.kind as 'type' | 'domain' }),
    parentId: t.exposeID('parent_id', { nullable: true, description: 'The parent class (a node type or another domain class).' }),
    nodeType: t.field({
      type: NodeTypeEnum,
      nullable: true,
      description: 'The nearest node-type ancestor — which nodes this class can be assigned to.',
      resolve: (c) => c.node_type as NodeType | null
    })
  })
});

// Content vocabulary, not schema: gated by page:read like list_tags, not like
// the schema catalogs.
const TagType = builder.objectRef<{ tag: string; count: number }>('Tag').implement({
  description: 'A tag on the nodes you may read, with how many of them carry it. Filter by tag with a NodeFilter `tag` condition (case-insensitive).',
  fields: (t) => ({
    tag: t.exposeString('tag'),
    count: t.exposeInt('count')
  })
});

export const NodeProperty = builder.objectRef<{ name: string; value: string }>('NodeProperty').implement({
  description: 'A single semantic property on a ContentNode.',
  fields: (t) => ({
    name: t.exposeString('name'),
    value: t.exposeString('value')
  })
});

export function registerSemanticQueryFields(): void {
  builder.queryFields((t) => ({
    propertyDefinitions: t.field({
      type: [PropertyDefinitionType],
      description:
        'Discoverable property names for building a NodeFilter — merges every property_definitions registration with the ad hoc names in use on the nodes you may read. Requires property:read (editor/admin).',
      resolve: (_root, _args, ctx) => {
        if (!can(ctx.user, 'property:read')) {
          throw new GraphQLError('forbidden', { extensions: { code: 'FORBIDDEN' } });
        }
        return getPropertySuggestions(ctx.user);
      }
    }),
    relationshipTypes: t.field({
      type: [RelationshipTypeType],
      description: 'The controlled relationship-type catalog, for building a link filter condition or an authoring UI. Requires relationship:read (editor/admin).',
      resolve: (_root, _args, ctx) => {
        if (!can(ctx.user, 'relationship:read')) {
          throw new GraphQLError('forbidden', { extensions: { code: 'FORBIDDEN' } });
        }
        return listRelationshipTypes();
      }
    }),
    nodeClasses: t.field({
      type: [NodeClassType],
      description: 'The class catalog (node types and domain classes; the abstract root is omitted) in tree order, for building a CLASS_ID intrinsic condition (by class id) or an authoring UI. Requires property:read (editor/admin).',
      resolve: async (_root, _args, ctx) => {
        if (!can(ctx.user, 'property:read')) {
          throw new GraphQLError('forbidden', { extensions: { code: 'FORBIDDEN' } });
        }
        return (await listNodeClasses()).filter((c) => c.kind !== 'root');
      }
    }),
    tags: t.field({
      type: [TagType],
      description: 'Every distinct tag on the nodes you may read, with how many of them carry it — the vocabulary for a NodeFilter `tag` condition. Requires page:read.',
      resolve: (_root, _args, ctx) => {
        if (!can(ctx.user, 'page:read')) {
          throw new GraphQLError('forbidden', { extensions: { code: 'FORBIDDEN' } });
        }
        return listTags(ctx.user);
      }
    })
  }));
}
