<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // One error message whatever went wrong: login() collapses unknown email,
  // wrong password and inactive account against enumeration (auth.server.ts).
  import { enhance } from '$app/forms';
  import { Logo } from '$lib/features/site/components';
  import { Input, Button, Alert } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';

  let { form } = $props();

  let submitting = $state(false);
  // The rate limit answers from the handle hook with raw JSON, before the
  // action runs; deserialize() passes it through untyped, so the callback
  // below recognizes it and shows a message, where update() would do nothing.
  let rateLimited = $state(false);
</script>

<div class="login-wrap">
  <div class="card">
    <div class="brand"><Logo size="lg" /></div>
    <h1>{m.login_title()}</h1>
    <p class="sub">{m.login_subtitle()}</p>

    {#if rateLimited}
      <div class="login-alert"><Alert tone="danger">{m.login_rate_limited()}</Alert></div>
    {:else if form?.error}
      <div class="login-alert"><Alert tone="danger">{form.error.message}</Alert></div>
    {/if}

    <form
      method="POST"
      use:enhance={() => {
        submitting = true;
        rateLimited = false;
        return async ({ result, update }) => {
          submitting = false;
          if (!('type' in result) && (result as unknown as { error?: { code?: string } }).error?.code === 'rate_limited') {
            rateLimited = true;
            return;
          }
          // A signed-in session starts with a fresh document, not a client-side
          // navigation: the destination may be the settings, which run under a
          // looser style-src than this page (platform/cspRoutes.ts), and a
          // Content-Security-Policy belongs to the document.
          if (result.type === 'redirect') {
            window.location.assign(result.location);
            return;
          }
          await update();
        };
      }}
    >
      <label
        >{m.login_email_label()}
        <Input name="email" type="email" autocomplete="username" value={form?.email ?? ''} required />
      </label>
      <label
        >{m.login_password_label()}
        <Input name="password" type="password" autocomplete="current-password" required />
      </label>
      <Button type="submit" variant="primary" loading={submitting}>{m.login_submit()}</Button>
    </form>
  </div>
</div>

<style>
  .login-wrap { min-height: 70vh; display: flex; align-items: center; justify-content: center; }
  .card { width: 100%; max-width: 360px; border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-lg); padding: 1.8rem; background: var(--ds-color-bg); }
  .brand { margin-bottom: 1rem; }
  h1 { margin: 0 0 0.25rem; font-size: 1.4rem; }
  .sub { color: var(--ds-color-muted); margin: 0 0 1.2rem; font-size: 0.9rem; }
  form { display: flex; flex-direction: column; gap: 0.8rem; }
  form :global(.ds-btn) { margin-top: 0.4rem; }
  label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.82rem; color: var(--ds-color-muted); }
  .login-alert { margin-bottom: 0.9rem; }
</style>
