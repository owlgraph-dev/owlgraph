---
status: accepted
date: 2026-09-22
---

# 0007. Styles reach a page through a per-page stylesheet

## Context

Authors style blocks — padding, colours, widths per screen size — and those
values used to reach the page as `style` attributes. A page also shows
authored HTML, and query results inside templates. A content security policy
that allows inline styles (`style-src 'unsafe-inline'`) leaves injected CSS
free to restyle the page, cover controls or leak data through selectors;
one that forbids them blocks every `style` attribute.

## Decision

The reader's routes send a strict `style-src`: the app's own stylesheets, and
the `<style>` elements a response carries under its own nonce — the site
theme, the fonts, and the page's block styles. A block's styles are an
**override set** that the renderer registers with the page's style
collector; the element gets a short, content-addressed id in `data-b`, and
the collector's rules go out as the page's nonce'd stylesheet. An HTML
block's own inline styles, once sanitized, take the same path. Style
attributes that a dependency hard-codes are allowed by their hash, each
listed and pinned by a test. The editor and the settings, which are not
reader routes, keep a looser policy.

## Consequences

- No `style` attribute reaches a reader route; the UI check fails a template
  that writes one, and an end-to-end lane checks the policy on a production
  build.
- Equal override sets share one rule, and a page renders the same ids every
  time.
- A navigation from a strict route to a loose one is a full page load.
- A library that draws with inline styles cannot run in a reader's page
  ([0008](0008-diagrams-draw-in-a-same-origin-frame.md)).

## Alternatives considered

- **`'unsafe-inline'`**: the injection risk the policy exists to remove.
- **Setting styles from JavaScript after load**: every page would depend on
  client code to look right, and the server's HTML would not.
- **A hash per style attribute**: values come from content, so the hashes
  would have to be computed per page anyway, and `'unsafe-hashes'` widens
  what any matching attribute may do.

See [Content Security Policy](../architecture/overview.md#content-security-policy)
and [Override sets and the carrier](../architecture/blocks/capabilities.md#override-sets-and-the-carrier).
