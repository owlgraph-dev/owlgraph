<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The notices AGPL-3.0 §0 asks for. The licence texts are plain text, not
  // pages: rel="external" hands them to the browser.
  import { Badge, Button, SettingsRow, SettingsGroup } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import { pluginLabel } from '$lib/plugins';
  import { localeNameInUi } from '$lib/platform/i18n/localeNames';
  import type { InstallationInfo } from './types';

  interface AboutPageData {
    version: string;
    /** The commit or tag the build was made from; null for a dev build. */
    revision: string | null;
    sourceHref: string;
    /** For `installation:view` only, else null: nothing of it is gathered. */
    installation: InstallationInfo | null;
    /** The root layout's footer (shell/layout.server.ts). */
    footer: { branding: { title: string | null } | null };
  }

  let { data }: { data: AboutPageData } = $props();

  const operator = $derived(data.footer.branding?.title ?? null);

  const SECRET_KEY = {
    set: { tone: 'success', label: m.about_secret_set },
    unset: { tone: 'neutral', label: m.about_secret_unset },
    unfit: { tone: 'danger', label: m.about_secret_unfit },
  } as const;
</script>

<svelte:head>
  <title>{m.shell_about_software()} · owlgraph</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<article class="about">
  <header class="head">
    {#if operator}<p class="eyebrow">{operator}</p>{/if}
    <h1>{m.shell_about_software()}</h1>
  </header>

  <p class="version">
    {data.revision ? m.about_runs_version({ version: data.version, revision: data.revision }) : m.about_runs_version_dev({ version: data.version })}
  </p>
  <p class="notice">{m.about_license_notice()}</p>

  <div class="actions">
    <Button href={data.sourceHref}>{m.about_source_code()}</Button>
    <Button href="/-/license" rel="external">{m.about_license()}</Button>
    <Button href="/licenses.txt" rel="external">{m.about_third_party()}</Button>
  </div>

  {#if data.installation}
    {@const i = data.installation}
    {@const key = SECRET_KEY[i.secretKey]}
    <div class="installation">
      <SettingsGroup title={m.about_installation_heading()} intro={m.about_installation_intro()}>
        <SettingsRow label={m.about_row_version()}><span class="value">{i.version}</span></SettingsRow>
        <SettingsRow label={m.about_row_revision()}>
          <span class="value" class:mono={i.revision !== 'dev'}>{i.revision === 'dev' ? m.about_value_dev_build() : i.revision}</span>
        </SettingsRow>
        <SettingsRow label={m.about_row_origin()}><span class="value mono">{i.origin}</span></SettingsRow>
        <SettingsRow label={m.about_row_runtime()}><span class="value">{m.about_runtime_value({ version: i.node })}</span></SettingsRow>
        <SettingsRow label={m.about_row_database()}><span class="value">{m.about_database_value({ version: i.postgres })}</span></SettingsRow>
        <SettingsRow label={m.about_row_languages()}>
          <span class="value">
            {m.about_languages_value({ names: i.languages.enabled.map(localeNameInUi).join(', '), defaultName: localeNameInUi(i.languages.defaultLocale) })}
          </span>
        </SettingsRow>
      </SettingsGroup>

      {#if i.integrations.length > 0}
        <SettingsGroup title={m.about_integrations_heading()}>
          {#each i.integrations as integration (integration.id)}
            <SettingsRow label={pluginLabel(integration.id)}>
              <span class="values">
                <span class="value">
                  {integration.enabled ? m.about_integration_on() : m.about_integration_off()}{#if integration.host}<span class="sep" aria-hidden="true"> · </span><span class="mono">{integration.host}</span>{/if}
                </span>
                {#if integration.connections}
                  <span class="value muted">{m.about_integration_connections({ active: integration.connections.active, total: integration.connections.total })}</span>
                {/if}
              </span>
            </SettingsRow>
          {/each}
        </SettingsGroup>
      {/if}

      <SettingsGroup title={m.about_diagnostics_heading()}>
        <SettingsRow label={m.about_row_schema()} description={m.about_row_schema_desc()}>
          <span class="values">
            <span class="value">{m.about_schema_applied({ count: i.schema.applied, latest: i.schema.latest ?? '—' })}</span>
            {#if i.schema.refused}
              {@const refused = i.schema.refused}
              <span><Badge tone="danger">{m.about_schema_blocked()}</Badge></span>
              <span class="value">
                {refused.cause === 'partial'
                  ? m.about_schema_refused({ baseline: refused.baseline, tag: refused.tag })
                  : m.about_schema_refused_unmatched({ baseline: refused.baseline })}
              </span>
            {:else if i.schema.pending.length > 0}
              <span><Badge tone="warning">{m.about_schema_behind()}</Badge></span>
              <span class="value">{m.about_schema_pending({ names: i.schema.pending.join(', ') })}</span>
              {#if i.schema.adopts}
                <span class="value">{m.about_schema_adopts({ baseline: i.schema.adopts.baseline, count: i.schema.adopts.replaced })}</span>
              {/if}
            {:else}
              <span class="value muted">{m.about_schema_current()}</span>
            {/if}
          </span>
        </SettingsRow>
        <SettingsRow label={m.about_row_secret_key()} description={m.about_row_secret_key_desc()}>
          <Badge tone={key.tone}>{key.label()}</Badge>
        </SettingsRow>
      </SettingsGroup>
    </div>
  {/if}
</article>

<style>
  .about { display: flex; flex-direction: column; gap: var(--ds-space-md); }
  .head { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
  .eyebrow { margin: 0; font-size: var(--ds-text-sm); font-weight: var(--ds-weight-medium); color: var(--ds-color-muted); }
  h1 { margin: 0; }
  p { margin: 0; line-height: 1.55; }
  .notice { color: var(--ds-color-muted); }
  /* Wraps on a narrow column: a row of actions never scrolls sideways. */
  .actions { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); }
  .installation { margin-top: var(--ds-space-lg); }
  .values { display: flex; flex-direction: column; gap: var(--ds-space-sm); }
  .value { font-size: var(--ds-text-md); line-height: 1.45; overflow-wrap: anywhere; }
  .muted { color: var(--ds-color-muted); }
  /* A hash, an address, a host: characters to read off one by one. */
  .mono { font-family: var(--ds-font-mono); font-size: var(--ds-text-sm); }
</style>
