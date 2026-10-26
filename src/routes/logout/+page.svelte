<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Logout is the action's POST; this page shows for a GET only.
  import * as m from '$lib/paraglide/messages';
</script>

<p>{m.logout_page_body({ signOut: m.account_menu_sign_out() })} <a href="/">{m.logout_page_home()}</a></p>
