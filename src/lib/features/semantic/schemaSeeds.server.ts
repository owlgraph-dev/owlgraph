// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The baseline's seed rows of the schema again, for ensureCoreClasses() and
// the e2e reseed after a truncate; keep the two in step.
import type { LocalizedText } from '$lib/platform/i18n/localizedText';
import type { NodeType } from '$lib/features/nodes/server';

export interface PropertyGroupSeed {
  slug: string;
  label: LocalizedText;
  description: LocalizedText;
}

export interface PropertyDefinitionSeed {
  localName: string;
  groupSlug: string;
  label: LocalizedText;
  datatype: string;
  description: LocalizedText;
}

export interface CoreClassSeed {
  slug: string;
  label: LocalizedText;
  description: LocalizedText;
}

export const CORE_GROUP_SEED: PropertyGroupSeed = {
  slug: 'core',
  label: { en: 'Core', de: 'Kern' },
  description: {
    en: 'Default namespace for properties defined before groups existed.',
    de: 'Standard-Namensraum für Eigenschaften, die vor den Gruppen definiert wurden.',
  },
};

export const DOCUMENTS_GROUP_SEED: PropertyGroupSeed = {
  slug: 'documents',
  label: { en: 'Documents', de: 'Dokumente' },
  description: { en: 'Well-known fields for uploaded documents.', de: 'Bekannte Felder für hochgeladene Dokumente.' },
};

export const DOCUMENT_PROPERTY_SEEDS: readonly PropertyDefinitionSeed[] = [
  { localName: 'author', groupSlug: 'documents', label: { en: 'Author', de: 'Autor' }, datatype: 'text', description: {} },
  {
    localName: 'source',
    groupSlug: 'documents',
    label: { en: 'Source', de: 'Quelle' },
    datatype: 'text',
    description: {
      en: 'Bibliographic source, such as the publisher or journal. Not the link to the document itself.',
      de: 'Bibliografische Quelle, etwa Verlag oder Zeitschrift. Nicht der Link zum Dokument selbst.',
    },
  },
  { localName: 'description', groupSlug: 'documents', label: { en: 'Description', de: 'Beschreibung' }, datatype: 'longtext', description: {} },
  { localName: 'abstract', groupSlug: 'documents', label: { en: 'Abstract', de: 'Zusammenfassung' }, datatype: 'longtext', description: {} },
];

export const ROOT_CLASS_SEED: CoreClassSeed = {
  slug: 'node',
  label: { en: 'Node', de: 'Knoten' },
  description: {
    en: 'The abstract root of the class hierarchy: every page and document is a node.',
    de: 'Die abstrakte Wurzel der Klassenhierarchie: Jede Seite und jedes Dokument ist ein Knoten.',
  },
};

export const TYPE_CLASS_SEEDS: readonly (CoreClassSeed & { slug: NodeType; group: string | null })[] = [
  {
    slug: 'page',
    label: { en: 'Page', de: 'Seite' },
    description: { en: 'Editable pages: the default kind of content.', de: 'Bearbeitbare Seiten: die Standardart von Inhalten.' },
    group: null,
  },
  {
    slug: 'document',
    label: { en: 'Document', de: 'Dokument' },
    description: {
      en: 'Uploaded documents: author, source, description, abstract.',
      de: 'Hochgeladene Dokumente: Autor, Quelle, Beschreibung, Zusammenfassung.',
    },
    group: 'documents',
  },
  {
    slug: 'collection',
    label: { en: 'Collection', de: 'Sammlung' },
    description: {
      en: 'An ordered set of nodes: documents someone gathered, or a folder another service holds.',
      de: 'Eine geordnete Menge von Knoten: Dokumente, die jemand zusammengestellt hat, oder ein Ordner, den ein anderer Dienst hält.',
    },
    group: null,
  },
];
