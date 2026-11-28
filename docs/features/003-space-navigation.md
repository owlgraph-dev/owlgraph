---
status: draft
issue:
adrs: ['0002', '0004']
updated: 2026-11-28
---

# 003. Space navigation

## Problem

A space has no navigation of its own. Whoever looks after one part of a
site builds a portal page by hand that links its key pages, and a reader
loses that page the moment they follow a link away from it. Nothing on a
page says which part of the site it belongs to, and nothing leads back to
where that part begins.

The site's navigation in the app bar cannot carry this: it holds a handful of
entries and is the same on every page.

A space can stand for a project, a customer, a department or a topic.
The feature assumes none of them.

## Scope

- **A space can have navigation of its own**: links and group headings,
  one level of nesting, the same shape as the site's navigation. A link
  points to a node in any space or to an outside address.
- **A space can have a home page**, one of its own pages. The space's
  address, `/<space>`, leads to it.
- **A sidebar on every page of that space.** It shows the space's
  name, which links to the home page, then the entries, with the current
  page marked. It can be collapsed.
- **Only where it is defined.** A space without navigation has no
  sidebar, and its pages look as they do today.
- **Crossing between parts of the site reads as crossing.** The content
  stays still inside a space and moves only when the reader enters or
  leaves one with navigation.
- **A breadcrumb above the page's title**: the space, then the page.
- **On narrow windows and phones** the navigation is still reachable, without
  taking the content's room.
- **Maintained without the admin role.** A permission of its own covers a
  space's navigation and home page, from the settings and from the
  sidebar itself.

## Non-goals

- Moving the site's navigation from the app bar into a sidebar.
- A sidebar for the default space.
- Entries drawn from the graph, such as all pages of a class. The stored
  navigation must leave room for that kind of entry later.
- More than one level of nesting.
- A colour or an icon per space.
- Maintainers who look after one space only.
- Agents editing a space's navigation.

## Acceptance criteria

Where it shows:

1. A page in a space whose navigation has at least one entry the viewer
   may see shows the sidebar. A page in a space without navigation, and
   every page of the default space, shows none.
2. The sidebar's header is the space's name. It links to the home page
   when one is set and the viewer may read it, and is plain text otherwise.
3. The entry that points to the current node is marked as current, and a
   group that holds it is open.
4. Whether the sidebar is collapsed is remembered from page to page in the
   same browser.

Moving between pages:

5. From page to page within a space the sidebar keeps its scroll
   position and its open groups, and the content does not move.
6. Between two spaces that both have navigation the sidebar stays in
   place and shows the other space's name and entries, and the content
   does not move.
7. Entering or leaving a space with navigation slides the sidebar in or
   out and shifts the content with it. The page's scroll position and the
   focus are kept, and nothing is animated for a reader who asked for
   reduced motion.

What a viewer sees:

8. A viewer gets only the entries whose target they may read. A group left
   without entries is not shown. What the page is sent holds nothing of the
   entries left out.
9. A viewer who may not read at the space's access level gets no
   navigation at all, its headings and outside links included. A page opened
   through a share link never shows a sidebar.

Home page and addresses:

10. `/<space>` leads to the space's home page when one is set, and
    is not found otherwise.
11. Only a page of the space can be its home page. When that page is
    deleted or moved to another space, the space has no home page.
12. A page in a space with navigation shows the space's name and its
    own title above its title, the name linked as in the sidebar's header.

Maintaining it:

13. A user with the permission can edit any space's navigation and home
    page, from the Spaces settings and from the sidebar. Without it both
    ways in are absent and the server refuses the change.
14. The permission allows no change to the site's navigation, and none to a
    space's name, access level or members.
15. An outside address is accepted only as `http`, `https` or `mailto`.
16. An entry keeps pointing to its node when the node is renamed or moved.
    Deleting a space deletes its navigation.

Room:

17. In a wide window the sidebar and the panel of a page's connections both
    sit beside the content. As the window narrows, the connections panel
    lies over the content first, then the sidebar becomes a drawer, and on a
    phone the space's entries are in the menu sheet.
18. A page has the same content width in the editor as when it is read, with
    the sidebar and without.
19. The sidebar is a navigation landmark with a name of its own, and the
    current entry is announced as current.

## Affected components

- [Architecture overview](../architecture/overview.md): the shell, and the
  `site` and `spaces` features.
- [Routing](../architecture/routing.md): the space's own address.
- [Authorization and visibility](../architecture/authorization.md): the new
  action, and navigation answered for its viewer.
- [Settings](../architecture/settings.md): the Spaces section.
- [Responsive behaviour](../architecture/responsive.md): the drawer and the
  menu sheet.
- [Graph view](../architecture/graph-view.md): the connections panel beside
  a page.
- [Editor](../architecture/editor.md): the width of the canvas.
- [Design system](../architecture/design-system/overview.md): the sidebar as
  an element of the app's frame.

## Decisions and constraints

- **Filtered on the server, for the viewer**
  ([decision 0002](../adr/0002-authorization-is-server-enforced-and-viewer-scoped.md)).
  A label can give away what a part of the site holds, so the whole
  navigation is withheld from someone who cannot read at the space's
  level, not only its links.
- **Present by its data, not by a switch**
  ([decision 0004](../adr/0004-null-means-inherit.md)). A space has a
  sidebar because it has entries, and a home page because one is set. There
  is no setting that turns either on.
- **The app bar and the site's navigation stay as they are.**
- **No word for what a space is**, in the model or in the interface: not
  "project", not "area".
- **A separate permission**, held by admins and open to a later role between
  editor and admin. It is checked with the space it is asked for, so
  that maintainers of a single space can follow without a change to
  every call.
- **Navigation labels follow the site's navigation** in how they are
  localized.
- **The strict style policy holds**: the sidebar adds no inline style.

## Open questions

None blocks the work.

- Should the default space get a sidebar later? It would be a site-wide
  sidebar almost for free, and it collides with a landing page that spans
  the window.
- A change of space is easy to miss when both have navigation: only the
  header and the breadcrumb change. Is that enough without a colour or an
  icon per space?

## Implementation notes
