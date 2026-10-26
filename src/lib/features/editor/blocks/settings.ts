// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Each block kind's own settings panel, shown before its capability sections.
// A kind without one offers only capability sections.
import type { Component } from 'svelte';
import type { BlockSettingsProps } from '../blockSettings/types';
import CalloutSettings from './callout/CalloutSettings.svelte';
import CodeBlockSettings from './code/CodeBlockSettings.svelte';
import TableSettings from './table/TableSettings.svelte';
import HtmlBlockSettings from './html/HtmlBlockSettings.svelte';
import ImageSettings from './image/ImageSettings.svelte';
import ListSettings from './list/ListSettings.svelte';
import SectionSettings from './section/SectionSettings.svelte';
import QuickLinkSettings from './quickLink/QuickLinkSettings.svelte';
import CollectionSettings from './collection/CollectionSettings.svelte';
import DocumentSettings from './document/DocumentSettings.svelte';
import UnknownSettings from './unknown/UnknownSettings.svelte';

export const BLOCK_SETTINGS: Readonly<Record<string, Component<BlockSettingsProps>>> = {
  callout: CalloutSettings,
  codeBlock: CodeBlockSettings,
  table: TableSettings,
  htmlBlock: HtmlBlockSettings,
  image: ImageSettings,
  quickLink: QuickLinkSettings,
  collectionBlock: CollectionSettings,
  documentBlock: DocumentSettings,
  bulletList: ListSettings,
  orderedList: ListSettings,
  pageSection: SectionSettings,
  unknownBlock: UnknownSettings,
};

export function blockSettingsOf(type: string): Component<BlockSettingsProps> | undefined {
  return Object.prototype.hasOwnProperty.call(BLOCK_SETTINGS, type) ? BLOCK_SETTINGS[type] : undefined;
}
