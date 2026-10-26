// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Mermaid under a strict style-src (platform/csp.ts, docs/architecture/theming.md
// "Content scheme"). Mermaid writes inline styles, which the reader's routes block,
// so it draws in a same-origin helper frame whose own policy allows them. The
// frame returns markup with every inline declaration turned into a class, plus
// the stylesheet as text, which the page inserts under its nonce. The editor
// draws through the same frame, so it matches the page.
import { styleNonceFor } from '$lib/platform/styleNonce';

export const MERMAID_FRAME_PATH = '/api/embed/mermaid';

type RenderRequest = { type: 'mermaid:render'; id: string; code: string; config: Record<string, unknown> };
type RenderResult = { type: 'mermaid:result'; id: string; svg: string; css: string } | { type: 'mermaid:error'; id: string; message: string };
type Ready = { type: 'mermaid:ready' };

const RENDER_TIMEOUT_MS = 30_000;

// The page side.

let frameReady: Promise<Window> | null = null;
const pending = new Map<string, { resolve: (r: { svg: string; css: string }) => void; reject: (e: Error) => void; timer: number }>();
let sequence = 0;

function frameWindow(): Promise<Window> {
  if (frameReady) return frameReady;
  frameReady = new Promise<Window>((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.src = MERMAID_FRAME_PATH;
    iframe.className = 'mermaid-frame';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    iframe.title = '';
    const onMessage = (event: MessageEvent<Ready | RenderResult>) => {
      if (event.origin !== window.location.origin || event.source !== iframe.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'mermaid:ready') {
        resolve(iframe.contentWindow!);
        return;
      }
      const waiter = pending.get(data.id);
      if (!waiter) return;
      pending.delete(data.id);
      window.clearTimeout(waiter.timer);
      if (data.type === 'mermaid:result') waiter.resolve({ svg: data.svg, css: data.css });
      else waiter.reject(new Error(data.message));
    };
    window.addEventListener('message', onMessage);
    iframe.addEventListener('error', () => reject(new Error('The diagram frame failed to load.')));
    document.body.appendChild(iframe);
  });
  return frameReady;
}

/** Markup without style attributes, and its stylesheet text. */
export async function renderDiagramInFrame(code: string, config: Record<string, unknown>): Promise<{ svg: string; css: string }> {
  const target = await frameWindow();
  const id = `mmd-${Date.now().toString(36)}-${(sequence++).toString(36)}`;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error('The diagram took too long to render.'));
    }, RENDER_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    const message: RenderRequest = { type: 'mermaid:render', id, code, config };
    target.postMessage(message, window.location.origin);
  });
}

/** The stylesheet goes under the document's nonce, inside the SVG so it travels with it. */
export function mountDiagram(el: HTMLElement, rendered: { svg: string; css: string }): void {
  el.innerHTML = rendered.svg;
  const svg = el.querySelector('svg');
  if (!svg || !rendered.css) return;
  const style = document.createElement('style');
  style.nonce = styleNonceFor('');
  style.textContent = rendered.css;
  svg.prepend(style);
}

// The frame side.

/**
 * Each distinct style attribute becomes a class scoped to the diagram's id,
 * and the SVG's <style> elements are lifted out into the returned stylesheet.
 */
export function separateInlineStyles(svgMarkup: string, id: string): { svg: string; css: string } {
  const template = document.createElement('template');
  template.innerHTML = svgMarkup;
  const root = template.content.querySelector('svg');
  if (!root) return { svg: svgMarkup, css: '' };
  let css = '';
  for (const style of Array.from(root.querySelectorAll('style'))) {
    css += style.textContent ?? '';
    style.remove();
  }
  const classes = new Map<string, string>();
  const scope = `#${CSS.escape(id)}`;
  for (const el of Array.from(root.querySelectorAll<Element>('[style]'))) {
    const text = el.getAttribute('style')?.trim() ?? '';
    el.removeAttribute('style');
    if (!text) continue;
    let cls = classes.get(text);
    if (!cls) {
      cls = `m${classes.size.toString(36)}`;
      classes.set(text, cls);
      css += `${scope} .${cls}{${text}}`;
    }
    el.classList.add(cls);
  }
  const rootStyle = root.getAttribute('style')?.trim();
  if (rootStyle) {
    root.removeAttribute('style');
    css += `${scope}{${rootStyle}}`;
  }
  return { svg: template.innerHTML, css };
}

export function serveMermaidFrame(): () => void {
  let mermaidModule: Promise<typeof import('mermaid')['default']> | null = null;
  const parent = window.parent;
  const draw = async (data: RenderRequest) => {
    try {
      mermaidModule ??= import('mermaid').then((m) => m.default);
      const mermaid = await mermaidModule;
      // The safety settings are pinned here, whatever the parent sends.
      mermaid.initialize({ ...data.config, startOnLoad: false, securityLevel: 'strict' });
      const { svg } = await mermaid.render(data.id, String(data.code ?? ''));
      const result: RenderResult = { type: 'mermaid:result', id: data.id, ...separateInlineStyles(svg, data.id) };
      parent.postMessage(result, window.location.origin);
    } catch (err) {
      const result: RenderResult = { type: 'mermaid:error', id: data.id, message: err instanceof Error ? err.message : String(err) };
      parent.postMessage(result, window.location.origin);
    }
  };
  // One at a time: Mermaid applies `initialize` at once, so two diagrams drawn
  // together would both get the config that arrived last.
  let queue: Promise<void> = Promise.resolve();
  const onMessage = (event: MessageEvent<RenderRequest>) => {
    if (event.origin !== window.location.origin || event.source !== parent) return;
    const data = event.data;
    if (!data || data.type !== 'mermaid:render' || typeof data.id !== 'string') return;
    queue = queue.then(() => draw(data));
  };
  window.addEventListener('message', onMessage);
  const ready: Ready = { type: 'mermaid:ready' };
  parent.postMessage(ready, window.location.origin);
  return () => window.removeEventListener('message', onMessage);
}
