# owlgraph Plugin Exception, version 1.0

Additional permission under section 7 of the GNU Affero General Public
License, version 3 (the "AGPL").

Copyright (C) 2026 Alexander Rensch

owlgraph is licensed under the AGPL (see `LICENSE`). As the copyright holder,
I grant you the following additional permission.

## 1. Definitions

**"owlgraph"** means the software distributed by the copyright holder under
the AGPL together with this exception.

**"Plugin Interface"** means the interfaces that owlgraph's documentation
designates as public for extending owlgraph or communicating with it. This
includes the plugin loading mechanism, the documented extension points, the
plugin manifest format and the public network API (for example its HTTP
endpoints). Interfaces that are not designated as public, such as internal
modules, functions, classes or data structures, are not part of the Plugin
Interface, even if they are technically reachable.

**"Plugin"** means a work that:

1. interacts with owlgraph only through the Plugin Interface;
2. does not include any part of owlgraph's source code or object code, except
   for the minimum needed to use the Plugin Interface, such as interface
   declarations, type definitions and examples published for that purpose;
   and
3. does not modify, replace, patch or override owlgraph's own code, whether
   at build time or at run time.

**"Client"** means a separate program that communicates with owlgraph only
through its public network API, for example a separately developed frontend
for owlgraph running in headless mode.

## 2. Permission

You may create, use, convey and make available Plugins and Clients under
terms of your choice, including proprietary terms. They are not covered by
the AGPL merely because they work with owlgraph. In particular:

1. Combining a Plugin with owlgraph, or running a Plugin inside an owlgraph
   instance, does not make the Plugin a work based on owlgraph, and does not
   require you to provide the Plugin's source code under section 6 or
   section 13 of the AGPL.
2. Running an otherwise unmodified copy of owlgraph together with Plugins
   does not make it a modified version of owlgraph for the purposes of
   section 13 of the AGPL.
3. Clients are separate works and are not covered by the AGPL.

## 3. What remains under the AGPL

owlgraph itself, including every modification to it, remains under the
AGPL. If you convey owlgraph, or modify it and let users interact with it
over a network, the AGPL applies to owlgraph in full.

## 4. Modified versions

If you modify owlgraph, you may extend this exception to your version, but
you are not required to. If you do not wish to, delete this exception from
your version, as section 7 of the AGPL permits.

## 5. Changes to the Plugin Interface

Which interfaces belong to the Plugin Interface is defined by owlgraph's
documentation for each release. A work that qualifies as a Plugin for a
given release remains a Plugin for that release, even if a later release
changes the Plugin Interface.
