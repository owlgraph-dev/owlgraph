---
status: accepted
date: 2026-10-11
---

# 0013. Nextcloud connections use Login Flow v2

## Context

A person connects their own Nextcloud account so that owlgraph reads their
files as them, and Nextcloud's own permissions decide what they see. The
concept assumed OAuth 2 with the authorization-code flow. That needs an OAuth
client registered in Nextcloud for each owlgraph installation, a callback
route, and refresh tokens to keep. Nextcloud's Login Flow v2 instead lets a
person approve a client in their own browser, while the client polls for the
result, and mints an app password for it that the person can see and revoke
in their Nextcloud.

## Decision

A connection is made with Login Flow v2. owlgraph starts the flow, the person
approves it in Nextcloud, and owlgraph polls the fixed path on the configured
origin — never an address the response names — for the app password.
owlgraph keeps the password sealed, bound to the person, the plugin and the
origin it was made for, and uses it only for reads. Disconnecting deletes it
and asks Nextcloud to forget it. A refused password is not retried on its
own, since Nextcloud counts refusals against the caller's address.

## Consequences

- Connecting needs no setup in Nextcloud by its admin, and no callback route
  in owlgraph.
- An app password is not scoped: it can do what the account can. owlgraph
  keeps it sealed per purpose and for one origin, and uses it only to read.
- OAuth 2, OpenID Connect and identity-provider tokens stay reserved
  credential kinds, for a later plugin or a later version.

## Alternatives considered

- **OAuth 2 authorization code**: scoped tokens, but an admin's registration
  per installation, a callback route and refresh handling.
- **A service account**: one credential for everyone would read past each
  person's own permissions.

See [The Nextcloud plugin](../architecture/nextcloud.md).
