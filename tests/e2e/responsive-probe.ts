// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Pages for the responsive guardrail (docs/architecture/responsive.md): the compositions a
// phone has to handle, and text that breaks a narrow column, a German compound
// and a long URL. Every container carries a block id, found in the editor and on the page.

export const LONG_WORD = 'Barrierefreiheitsstärkungsgesetzumsetzungsverordnung';
export const LONG_URL =
  'https://beispiel.example.org/wissensdatenbank/kategorien/barrierefreiheit/anforderungen-an-oeffentliche-stellen/2026/verordnung-und-umsetzungshinweise?ansicht=vollstaendig';

const txt = (text: string) => ({ type: 'text', text });
const p = (text: string) => ({ type: 'paragraph', content: [txt(text)] });
const h = (level: number, text: string) => ({ type: 'heading', attrs: { level }, content: [txt(text)] });
const cell = (...content: unknown[]) => ({ type: 'gridCell', content });
const fcell = (attrs: Record<string, unknown>, ...content: unknown[]) => ({ type: 'flexCell', attrs, content });
const grid = (blockId: string, columnWidths: number[], attrs: Record<string, unknown>, ...cells: unknown[]) => ({
  type: 'grid',
  attrs: { blockId, columnWidths, ...attrs },
  content: cells,
});
const flex = (blockId: string, layout: Record<string, unknown>, attrs: Record<string, unknown>, ...cells: unknown[]) => ({
  type: 'flexContainer',
  attrs: { blockId, layout: { desktop: layout }, ...attrs },
  content: cells,
});
const section = (blockId: string, attrs: Record<string, unknown>, ...cells: unknown[]) => ({ type: 'pageSection', attrs: { blockId, ...attrs }, content: cells });
const card = { surface: { desktop: { bg: 'token:subtle', radius: 12 } }, spacing: { desktop: { pad: 24 } } };
const ref = (label: string, variant: string) => ({ type: 'quickLink', attrs: { refType: 'url', url: 'https://example.com/', label, variant } });
const table = (blockId: string, rows: string[][]) => ({
  type: 'table',
  attrs: { blockId, columnWidths: rows[0].map(() => 1) },
  content: rows.map((r, i) => ({
    type: 'tableRow',
    attrs: { isHeader: i === 0 },
    content: r.map((text) => ({ type: 'tableCell', attrs: { isHeader: i === 0 }, content: [txt(text)] })),
  })),
});

const LOREM = 'Wissensgraphen verbinden Seiten, Dokumente und Eigenschaften zu einem Netz, in dem jede Aussage ihre Herkunft behält.';

/** An article on a main + aside page; `imageId`'s figure sits past the opening blocks, so it loads lazily. */
export const articleDoc = (imageId: string) => ({
  type: 'doc',
  attrs: { layout: { mode: 'columns', template: { desktop: [2, 1], tablet: [2, 1], phone: [1] }, preset: 'main-aside' } },
  content: [
    section('art-title', { width: 'wide', columns: 'single' }, cell(h(1, `${LONG_WORD}: was sich ändert`), p(LOREM))),
    section(
      'art-main',
      { width: 'wide' },
      cell(p(`Die vollständige Fassung steht unter ${LONG_URL} bereit.`), p(`${LONG_WORD} passt auf keinem Telefon in eine Zeile.`)),
      cell({ type: 'callout', attrs: { variant: 'info' }, content: [txt('Randnotiz zum Absatz daneben.')] })
    ),
    section(
      'art-detail',
      { width: 'wide' },
      cell(
        h(2, 'Was sich ändert'),
        { type: 'bulletList', content: [{ type: 'listItem', content: [p(`Lange Komposita wie ${LONG_WORD} brechen um.`)] }] },
        { type: 'codeBlock', attrs: { language: 'ts' }, content: [txt(`export const quelle = await fetch('${LONG_URL}');`)] }
      ),
      cell(ref('Zur Verordnung', 'outlined'), { type: 'image', attrs: { blockId: 'art-figure', assetId: imageId, alt: 'Abbildung zur Verordnung' } })
    ),
    section('art-band', { width: 'full', columns: 'single', surface: { desktop: { bg: 'token:subtle' } } }, cell(h(2, 'Ein Band über die volle Breite'), p(LOREM))),
    section(
      'art-table',
      { width: 'wide' },
      cell(table('art-deadlines', [
        ['Maßnahme', 'Zuständigkeit', 'Frist', 'Status', 'Bemerkung'],
        ['Formulare prüfen', 'IT-Referat', '01.03.2026', 'offen', LONG_URL],
      ])),
      cell(p('Bemerkung in der Nebenspalte.'))
    ),
  ],
});

/** A landing page: a hero band, card rows, icon + text rows, a stats band, a logo strip, a call to action, authored HTML. */
export const landingDoc = () => ({
  type: 'doc',
  content: [
    grid(
      'hero',
      [1],
      { width: 'full', bleedToTop: true, height: { desktop: { min: '480px' } }, surface: { desktop: { bg: '#0f172a' } }, spacing: { desktop: { pad: 48 } } },
      cell(
        { type: 'heading', attrs: { level: 1, typography: { desktop: { size: 'scale:6xl', color: '#ffffff' } } }, content: [txt('Wissen verbinden. Seiten gestalten.')] },
        flex('hero-buttons', { gap: 12, flexWrap: 'wrap' }, {}, fcell({}, ref('Jetzt starten', 'button')), fcell({}, ref('Mehr erfahren', 'outlined')))
      )
    ),
    flex('cards-flex', { gap: 24, flexWrap: 'wrap' }, { width: 'wide' }, ...['Seiten', 'Dokumente', 'Abfragen'].map((t) => fcell({ ...card, flexItem: { desktop: { size: 'fill' } } }, h(3, t), p('Kurzer Text, der die Karte beschreibt.')))),
    grid('cards-grid', [1, 1, 1], { width: 'wide', gap: 'lg' }, ...['Seiten', 'Dokumente', 'Abfragen'].map((t) => ({ ...cell(h(3, t), p('Kurzer Text.')), attrs: card }))),
    // Icon + text as a grid: the phone keeps the desktop's [1, 6].
    grid('icon-grid', [1, 6], { columnsByTier: { phone: [1, 6] } }, ...['Verknüpfen', 'Abfragen'].flatMap((t) => [cell(p('●')), cell(h(3, t), p('Ein Satz neben dem Symbol.'))])),
    // Icon + text as a flex row (no wrap): the icon Fixed, the text Fill, longer than a phone's line.
    flex('icon-row', { gap: 16, alignItems: 'center' }, {}, fcell({ flexItem: { desktop: { size: 'fixed', basis: '64px' } } }, p('●')), fcell({ flexItem: { desktop: { size: 'fill' } } }, p('Ein Symbol links, daneben ein Satz, der auf dem Telefon länger als die Zeile ist und umbrechen muss.'))),
    // The stats band: four figures, 2 × 2 on a phone.
    grid('stats', [1, 1, 1, 1], { width: 'full', columnsByTier: { phone: [1, 1] }, surface: { desktop: { bg: '#0f172a' } } }, ...['12.400', '98 %', '3', '24/7'].map((n) => cell({ type: 'heading', attrs: { level: 2, typography: { desktop: { color: '#ffffff' } } }, content: [txt(n)] }))),
    // The logo strip: on a phone it scrolls sideways in its own box.
    flex('logos', { gap: 24, justifyContent: 'space-between' }, { width: 'wide', layout: { desktop: { gap: 24, justifyContent: 'space-between' }, phone: { flexWrap: 'scroll' } } }, ...[1, 2, 3, 4, 5, 6].map((n) => fcell({ flexItem: { desktop: { size: 'fixed', basis: '140px' } } }, p(`Logo ${n}`)))),
    flex('cta', { gap: 16, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }, { width: 'full', surface: { desktop: { bg: 'token:accent-soft' } } }, fcell({}, h(2, 'Bereit für den Umzug?')), fcell({}, ref('Kontakt aufnehmen', 'button'))),
    {
      type: 'htmlBlock',
      attrs: {
        blockId: 'html-wide',
        html:
          '<table><tr><th>Jahr</th><th>Einnahmen in Euro</th><th>Ausgaben in Euro</th><th>Überschuss</th><th>Kommentar</th></tr><tr><td>2024</td><td>1.204.330,00</td><td>1.100.200,00</td><td>104.130,00</td><td>Sondereffekt Grundstücksverkauf</td></tr></table>' +
          '<div style="width:600px;border:1px solid #94a3b8">Dieses Element ist 600 Pixel breit.</div>',
      },
    },
  ],
});

/** Tables — a wide one, a small one, one in a grid cell — and a query whose results carry a long title. */
export const tablesDoc = (propName: string, value: string) => ({
  type: 'doc',
  content: [
    h(1, 'Tabellen'),
    table('wide-table', [
      ['Bezeichnung', 'Verantwortliche Organisationseinheit', 'Inkrafttreten', 'Rechtsgrundlage', 'Betroffene Angebote', 'Prüfintervall', 'Fundstelle'],
      ['Bürgerportal', 'Amt für Informationstechnik und Organisation', '01.01.2026', LONG_WORD, 'Formulare, Termine', 'halbjährlich', LONG_URL],
    ]),
    table('small-table', [['Tag', 'Von', 'Bis'], ['Mo', '8:00', '16:00']]),
    grid('table-grid', [1, 1], {}, cell(table('grid-table', [['Kennzahl', 'Wert', 'Trend'], ['Seiten', '12.400', '+4 %']])), cell(p(LOREM))),
    {
      type: 'queryBlock',
      attrs: {
        blockId: 'query-tiles',
        filter: { property: { name: propName, operator: 'EQ', value } },
        first: 10,
        formatOptions: { layout: { desktop: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } } },
      },
      content: [grid('query-tile', [1], { surface: { desktop: { border: '#cbd5e1', radius: 8 } } }, cell({ type: 'htmlBlock', attrs: { html: '<p><strong>{{{title}}}</strong></p>' } }))],
    },
  ],
});
