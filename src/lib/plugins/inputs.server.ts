// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What an agent may author of the plugins' blocks (docs/architecture/mcp.md), one line per
// plugin with any. A tuple, so the core's block taxonomy that joins the shapes
// (content/blocks/blockInputSchema.server.ts) stays a static union for zod and TypeScript.
import type { z } from 'zod';
import type { PluginBlockInput } from './api';
import { nextcloud } from './nextcloud/index';
import { nextcloudInputs } from './nextcloud/inputs.server';

const PLUGIN_INPUTS = [{ plugin: nextcloud.id, inputs: nextcloudInputs }] as const;

const INPUTS = [...nextcloudInputs] as const;

type ShapesOf<T extends readonly unknown[]> = { readonly [K in keyof T]: T[K] extends { shape: infer S } ? S : never };

export const PLUGIN_INPUT_SHAPES = INPUTS.map((input) => input.shape) as unknown as ShapesOf<typeof INPUTS>;

const kindOf = (input: PluginBlockInput) => (input.shape.shape.kind as z.ZodLiteral<string>).value;

/** The input, with its plugin's id, for the agent's name of a block kind; null for a kind no plugin adds. */
export function pluginInputOf(kind: string): { plugin: string; input: PluginBlockInput } | null {
  for (const { plugin, inputs } of PLUGIN_INPUTS) {
    for (const input of inputs as readonly PluginBlockInput[]) if (kindOf(input) === kind) return { plugin, input };
  }
  return null;
}

/** The agent's names of the plugins' block kinds, which the contract test holds distinct. */
export const PLUGIN_INPUT_KINDS: readonly string[] = (INPUTS as readonly PluginBlockInput[]).map(kindOf);

/** The agent's name for a plugin block kind (a node type), or null for one no plugin input makes. */
export function pluginInputKindOfBlock(block: string): string | null {
  const input = (INPUTS as readonly PluginBlockInput[]).find((i) => i.block === block);
  return input ? kindOf(input) : null;
}

/** Their paragraphs in append_block's description. */
export function pluginInputDescriptions(): string[] {
  return (INPUTS as readonly PluginBlockInput[]).map((input) => input.describe());
}
