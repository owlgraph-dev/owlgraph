// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The UI convention check, run by `npm run check` and as `npm run check:ui`
// (docs/architecture/design-system/overview.md, "Guardrails"). Over every .svelte and .css file,
// and page content's style-building modules for `color`:
//   color          a colour literal: chrome reads --ds-color-*, content --content-*
//   px             a chrome px length on spacing, radius or text, but 0, 1px, 2px
//   raw-element    a native control outside src/lib/design-system/
//   inline-style   a style attribute, or a CSS custom property passed to a
//                  component, which Svelte wraps in a styled element: both
//                  break the reader's strict style-src
//   shell-media    a phone-width @media that isn't PHONE_SHELL_MEDIA, or a
//                  768 px one that isn't COMPACT_CHROME_MEDIA (the phone held
//                  sideways may follow it)
// A marker with a reason, on the line or the one before, admits a case:
//     /* ui-check-allow: color — the hairline is a contrast companion */
//     <!-- ui-check-allow: raw-element — type=file has no primitive -->
// scripts/check-ui.baseline.json caps the violations a file already has, and
// counts only go down (`--write-baseline`).
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const BASELINE_PATH = join(ROOT, 'scripts', 'check-ui.baseline.json');
const WRITE_BASELINE = process.argv.includes('--write-baseline');

const RULES = ['color', 'px', 'raw-element', 'inline-style', 'shell-media'];
const DESIGN_SYSTEM = /^lib\/design-system\//;
const TOKEN_DEFINITIONS = /^app\.css$/;
// Page content, a plugin's block sheets included: reads --content-*, outside the px rule.
const CONTENT_STYLING = /^lib\/(?:features\/content\/(blocks\/.*\.css|listing\/.*\.css|components\/RenderedContent\.svelte)|plugins\/[^/]+\/blocks\/.*\.css)$/;
// Content style builders; tests assert colours and aren't builders.
const CONTENT_TS = /^lib\/(?:features\/content|plugins\/[^/]+\/blocks)\/(?!.*\/e2e\/).*(?<!\.test|\.spec)\.ts$/;
// The CSS named colours (transparent and currentColor are not literals).
const NAMED_COLORS = 'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'.split(' ');
const NAMED_COLOR = new RegExp(`(?<![\\w-])(?:${NAMED_COLORS.join('|')})(?![\\w-])`, 'gi');
// A named colour elsewhere (a font, an animation name) isn't a colour.
const COLOR_PROPERTY = /^(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|box-shadow|text-shadow|fill|stroke|caret-color|accent-color|text-decoration(?:-color)?|column-rule(?:-color)?|filter|--[\w-]+)$/;
const TS_NAMED_COLOR = /(?<![\w-])(?:black|white)(?![\w-])/g;
const COLOR_LITERAL = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?)\(/g;
const PX_PROPERTY = /^(?:padding|margin|gap|row-gap|column-gap|border-radius|font-size|line-height)(?:-[a-z-]+)?$/;
const PX_VALUE = /(?<![\w.-])(\d*\.?\d+)px\b/g;
const PX_ALLOWED = new Set(['0', '1', '2']);
const RAW_ELEMENT = /<(select|textarea|input|button)\b([^>]*)>/g;
const INPUT_TYPES_EXEMPT = new Set(['hidden', 'file', 'color', 'range', 'submit', 'image', 'reset', 'button', 'date', 'time', 'datetime-local']);
const INPUT_PRIMITIVE_FOR_TYPE = { checkbox: 'Checkbox', radio: 'RadioGroup' };
const PRIMITIVE_FOR = { select: 'Select', textarea: 'Textarea', input: 'Input (or NumberField)', button: 'Button (or ToolbarButton)' };
const ALLOW_MARKER = /ui-check-allow:\s*([a-z-]+)\s*(?:—|-|:)?\s*(\S.*)?$/;
// A style ATTRIBUTE on an element: `style=` after whitespace, never `style:`.
const INLINE_STYLE = /\sstyle\s*=\s*(?:"|'|\{)/g;
const SHELL_MEDIA = readFileSync(join(SRC, 'lib', 'design-system', 'shell.ts'), 'utf8').match(/PHONE_SHELL_MEDIA\s*=\s*'([^']+)'/)?.[1];
if (!SHELL_MEDIA) throw new Error('check-ui: PHONE_SHELL_MEDIA not found in src/lib/design-system/shell.ts');
const COMPACT_MEDIA = readFileSync(join(SRC, 'lib', 'design-system', 'shell.ts'), 'utf8').match(/COMPACT_CHROME_MEDIA\s*=\s*'([^']+)'/)?.[1];
if (!COMPACT_MEDIA) throw new Error('check-ui: COMPACT_CHROME_MEDIA not found in src/lib/design-system/shell.ts');
const SIDEWAYS = '(pointer: coarse) and (max-height: 500px)';
const COMPACT_WIDTH = /\(\s*(?:max-width\s*:\s*768px|width\s*<=\s*768px)\s*\)/;
const PHONE_WIDTH = /\(\s*(?:max-width\s*:\s*640px|width\s*<=\s*640px)\s*\)/;
const squash = (q) => q.replace(/\s+/g, ' ').trim();
// The opening tag of a COMPONENT, where a `--custom-property` attribute is a
// style prop rather than a plain attribute.
const COMPONENT_TAG = /<([A-Z][\w.]*|svelte:component)(?=[\s/>])/g;

/** Every component's opening tag and attributes; a `>` in a string or an expression doesn't end it. */
function* componentOpenTags(template) {
  for (const m of template.matchAll(COMPONENT_TAG)) {
    const start = m.index + m[0].length;
    let depth = 0;
    let quote = null;
    let i = start;
    for (; i < template.length; i++) {
      const c = template[i];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    yield { tag: m[1], attrs: template.slice(start, i), start };
  }
}

/** The `--name=` style props in a tag's attribute text, ignoring any inside a quoted value. */
function cssPropsIn(attrs) {
  const out = [];
  let quote = null;
  for (let i = 0; i < attrs.length; i++) {
    const c = attrs[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c !== '-' || attrs[i + 1] !== '-' || (i > 0 && /\S/.test(attrs[i - 1]))) continue;
    const m = /^--[a-zA-Z][\w-]*(?=\s*=)/.exec(attrs.slice(i));
    if (m) out.push({ name: m[0], index: i });
  }
  return out;
}

const rel = (p) => relative(SRC, p).split(sep).join('/');

const files = [];
(function walk(d) {
  for (const entry of readdirSync(d)) {
    const p = join(d, entry);
    if (statSync(p).isDirectory()) {
      if (entry !== 'paraglide') walk(p);
    } else if (/\.(svelte|css)$/.test(entry) || (entry.endsWith('.ts') && CONTENT_TS.test(rel(p)))) files.push(p);
  }
})(SRC);

// Spaces for a region's characters, newlines kept so line numbers stay true.
const blank = (s) => s.replace(/[^\n]/g, ' ');

// The <style> blocks (or the whole .css file) without comments; the rest blanked.
function styleText(source, isCss) {
  let text = source;
  if (!isCss) {
    text = blank(source);
    for (const m of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) {
      const start = m.index + m[0].length - '</style>'.length - m[1].length;
      text = text.slice(0, start) + m[1] + text.slice(start + m[1].length);
    }
  }
  return text.replace(/\/\*[\s\S]*?\*\//g, blank);
}

// A .svelte template with <script>, <style> and HTML comments blanked.
function templateText(source) {
  return source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, blank)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank);
}

// A TypeScript module with comments blanked; strings, where style values
// live, are kept.
function codeText(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// An allow marker for `rule` on `line` or the one before: 'ok', 'no-reason' or null.
function allowance(lines, line, rule) {
  for (const l of [line - 1, line - 2]) {
    const m = lines[l]?.match(ALLOW_MARKER);
    if (m && m[1] === rule) return m[2] ? 'ok' : 'no-reason';
  }
  return null;
}

// Map<file, Map<rule, [{ line, text }]>>
const violations = new Map();
const markerProblems = [];
function record(file, rule, line, text, lines) {
  const a = allowance(lines, line, rule);
  if (a === 'ok') return;
  if (a === 'no-reason') markerProblems.push(`${file}:${line} ui-check-allow for '${rule}' has no reason — say why the literal is unavoidable`);
  const byRule = violations.get(file) ?? new Map();
  const list = byRule.get(rule) ?? [];
  list.push({ line, text });
  byRule.set(rule, list);
  violations.set(file, byRule);
}

for (const p of files) {
  const file = rel(p);
  const source = readFileSync(p, 'utf8');
  // \r?\n: a CRLF working copy's trailing \r would defeat the marker's end anchor.
  const lines = source.split(/\r?\n/);
  if (file.endsWith('.ts')) {
    const code = codeText(source);
    for (const pattern of [COLOR_LITERAL, TS_NAMED_COLOR]) {
      for (const m of code.matchAll(pattern)) {
        if (code[m.index - 1] === '/') continue; // a URL fragment (/#top), not a colour
        record(file, 'color', lineOf(code, m.index), `${m[0]} → var(--content-*)`, lines);
      }
    }
    continue;
  }

  const isCss = file.endsWith('.css');
  const styles = styleText(source, isCss);
  const tokenDefinitions = TOKEN_DEFINITIONS.test(file);
  const content = CONTENT_STYLING.test(file);
  const chromeStyles = !tokenDefinitions && !content;
  const palette = content ? 'var(--content-*)' : 'var(--ds-color-*)';

  // color
  if (!tokenDefinitions) {
    for (const m of styles.matchAll(COLOR_LITERAL)) {
      const line = lineOf(styles, m.index);
      if (/url\(/.test(lines[line - 1])) continue; // url(#id), data: URIs
      record(file, 'color', line, `${m[0]} → ${palette}`, lines);
    }
    for (const d of styles.matchAll(/([a-z-]+)\s*:\s*([^;{}]+)/g)) {
      if (!COLOR_PROPERTY.test(d[1])) continue;
      // Custom-property names (var(--white)) and strings are not colours.
      const value = d[2].replace(/--[\w-]+/g, blank).replace(/(["'])[^"']*\1/g, blank);
      for (const m of value.matchAll(NAMED_COLOR)) record(file, 'color', lineOf(styles, d.index), `${d[1]}: ${m[0]} → ${palette}`, lines);
    }
  }

  // px — declarations only: `prop: value` up to the next ; or }
  if (chromeStyles) {
    for (const d of styles.matchAll(/([a-z-]+)\s*:\s*([^;{}]+)/g)) {
      if (!PX_PROPERTY.test(d[1])) continue;
      for (const v of d[2].matchAll(PX_VALUE)) {
        if (PX_ALLOWED.has(v[1])) continue;
        record(file, 'px', lineOf(styles, d.index), `${d[1]}: ${v[0]} → var(--ds-space-*) / --ds-radius-* / --ds-text-*`, lines);
      }
    }
  }

  // shell-media — a viewport query on the phone width is the shell's query
  for (const m of styles.matchAll(/@media\s+([^{]+)\{/g)) {
    const query = squash(m[1]);
    if (PHONE_WIDTH.test(query) && query !== SHELL_MEDIA) {
      record(file, 'shell-media', lineOf(styles, m.index), `@media ${query} → @media ${SHELL_MEDIA} (PHONE_SHELL_MEDIA)`, lines);
    }
    if (COMPACT_WIDTH.test(query) && query !== COMPACT_MEDIA && query !== `${COMPACT_MEDIA}, ${SIDEWAYS}`) {
      record(file, 'shell-media', lineOf(styles, m.index), `@media ${query} → @media ${COMPACT_MEDIA} (COMPACT_CHROME_MEDIA)`, lines);
    }
  }

  // raw-element
  if (!isCss && !DESIGN_SYSTEM.test(file)) {
    const template = templateText(source);
    for (const m of template.matchAll(RAW_ELEMENT)) {
      const tag = m[1];
      let primitive = PRIMITIVE_FOR[tag];
      if (tag === 'input') {
        const type = m[2].match(/\btype\s*=\s*["']?([a-z-]+)/)?.[1];
        if (type && INPUT_PRIMITIVE_FOR_TYPE[type]) primitive = INPUT_PRIMITIVE_FOR_TYPE[type];
        else if (type && INPUT_TYPES_EXEMPT.has(type)) continue;
      }
      record(file, 'raw-element', lineOf(template, m.index), `<${tag}> → ${primitive} from $lib/design-system`, lines);
    }
  }

  // inline-style — every .svelte template, the design system included
  if (!isCss) {
    const template = templateText(source);
    for (const m of template.matchAll(INLINE_STYLE)) {
      record(file, 'inline-style', lineOf(template, m.index), 'style attribute → a class, a style: directive undefined during SSR, or a per-page rule (data-b)', lines);
    }
    // A CSS custom property on a component renders a styled wrapper element.
    for (const { tag, attrs, start } of componentOpenTags(template)) {
      for (const prop of cssPropsIn(attrs)) {
        record(
          file,
          'inline-style',
          lineOf(template, start + prop.index),
          `${prop.name}= on <${tag}> → Svelte emits <svelte-css-wrapper style="display: contents">; set the property from a class instead`,
          lines
        );
      }
    }
  }
}

const counts = {};
for (const [file, byRule] of violations) {
  counts[file] = {};
  for (const rule of RULES) if (byRule.has(rule)) counts[file][rule] = byRule.get(rule).length;
}

if (WRITE_BASELINE) {
  const sorted = Object.fromEntries(Object.keys(counts).sort().map((f) => [f, counts[f]]));
  writeFileSync(BASELINE_PATH, JSON.stringify(sorted, null, 2) + '\n');
  const total = Object.values(counts).reduce((n, r) => n + Object.values(r).reduce((a, b) => a + b, 0), 0);
  console.log(`check-ui: baseline written (${Object.keys(counts).length} files, ${total} accepted violations)`);
  process.exit(0);
}

const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : {};
const problems = [...markerProblems];
const notices = [];
let underBaseline = 0;

for (const [file, byRule] of violations) {
  for (const [rule, list] of byRule) {
    const allowed = baseline[file]?.[rule] ?? 0;
    if (list.length > allowed) {
      const head = allowed
        ? `${file}: ${list.length} '${rule}' violation(s), baseline allows ${allowed} — fix the new one(s):`
        : `${file}: ${list.length} '${rule}' violation(s):`;
      problems.push(head + list.map((v) => `\n      ${file}:${v.line}  ${v.text}`).join(''));
    } else {
      underBaseline += list.length;
      if (list.length < allowed) notices.push(`${file}: '${rule}' is down to ${list.length} (baseline ${allowed}) — run \`node scripts/check-ui.mjs --write-baseline\``);
    }
  }
}
for (const [file, rules] of Object.entries(baseline)) {
  for (const rule of Object.keys(rules)) {
    if (!violations.get(file)?.has(rule)) notices.push(`${file}: '${rule}' is clean — remove it from the baseline (\`--write-baseline\`)`);
  }
}

for (const n of notices) console.log(`check-ui: note — ${n}`);
if (problems.length) {
  console.error(`check-ui: ${problems.length} problem(s)`);
  for (const p of problems) console.error('  - ' + p);
  console.error('  See docs/architecture/design-system/overview.md, "Guardrails" (tokens, primitives, the ui-check-allow escape hatch).');
  process.exit(1);
}
console.log(`check-ui: ok (${files.length} files; ${underBaseline} pre-existing violation(s) under baseline in ${Object.keys(counts).length} file(s))`);
