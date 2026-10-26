// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The attrs as the wrapper, the card's override set and the component's props,
// shared by the editor and the page so the two can't disagree.
import { isIconName } from '$lib/design-system/icons';
import { spaceAboveOverrides } from '../../capabilities/spacing/spacing';
import { surfaceVars } from '../../capabilities/surface/surface';
import { placementClass, placementVars } from '../../capabilities/placement/placement';
import { typographyVars } from '../../capabilities/typography/typography';
import type { TypographyRegistry } from '../../capabilities/typography/roles';
import { bodyDefaults } from '../../capabilities/typography/paragraphStyles';
import { defaultsFor, type ResolvedBlockDefaults } from '../../capabilities/defaults/blockDefaults';
import { mergeOverrides, NO_OVERRIDES, type OverrideSet } from '../../capabilities/overrides';
import { groupClass } from '../catalog';
import type { BlockWrapper } from '../scaffold/blockWrapper';
import { refIconPosition, quickLinkLabel, refUnderline, type QuickLinkAttrs } from './model';
import { quickLinkDefaults, quickLinkSurface, quickLinkVariant } from './variants';

/** The wrapper's overrides: only the no-underline case says anything. */
function quickLinkWrapOverrides(attrs: QuickLinkAttrs | undefined): OverrideSet {
  return refUnderline(attrs) ? NO_OVERRIDES : { '--quick-link-underline': 'none' };
}

/** The wrapper is the placed box (placement kind 'card'). */
export function quickLinkWrapper(attrs: QuickLinkAttrs | undefined): BlockWrapper {
  return {
    classes: ['quick-link-block', placementClass(attrs?.placement, 'card')].filter(Boolean),
    blockId: attrs?.blockId ?? null,
    overrides: mergeOverrides(quickLinkWrapOverrides(attrs), spaceAboveOverrides(attrs), placementVars(attrs?.placement, 'card')),
  };
}

/**
 * Only the variant's surface fields, plus the typography against the default
 * paragraph style, which a card follows like a grid cell does.
 */
export function quickLinkCardOverrides(attrs: QuickLinkAttrs | undefined, registry: TypographyRegistry, blockDefaults: ResolvedBlockDefaults): OverrideSet {
  return mergeOverrides(
    surfaceVars(quickLinkSurface(attrs), quickLinkDefaults(quickLinkVariant(attrs), defaultsFor('quickLink', blockDefaults)), 'surface', 'card'),
    typographyVars(attrs?.typography, bodyDefaults(registry), 'typography', registry)
  );
}

/**
 * Plain JSON: the page serializes the props into the island's attribute.
 * `ruleId` is '' for a card with no overrides of its own.
 */
export function quickLinkCardProps(attrs: QuickLinkAttrs | undefined, href: string, external: boolean, interactive: boolean, ruleId: string) {
  const icon = typeof attrs?.icon === 'string' && isIconName(attrs.icon) ? attrs.icon : null;
  const cls = [groupClass('quickLink'), 'cap-surface', 'cap-typography', icon ? `quick-link--icon-${refIconPosition(attrs)}` : ''].filter(Boolean).join(' ');
  return {
    variant: quickLinkVariant(attrs),
    href,
    external,
    label: quickLinkLabel(attrs),
    icon,
    iconPosition: refIconPosition(attrs),
    class: cls,
    interactive,
    ...(ruleId ? { 'data-b': ruleId } : {}),
  };
}
