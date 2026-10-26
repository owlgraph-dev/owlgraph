<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import LocalizedTextField, { type LocalizedTextLocale } from '../../LocalizedTextField.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  const OPTIONAL = '(optional)';
  // The words a consumer passes.
  const words = {
    languageLabel: 'Language',
    missingLabel: 'missing',
    requiredLabel: 'required',
    progressLabel: (filled: number, total: number) => `${filled}/${total} translated`,
    copyFrom: 'en',
    copyLabel: 'Copy from English',
  };
  // The author's own language first; English is the one every label needs.
  const LABEL_LOCALES: LocalizedTextLocale[] = [
    { code: 'de', label: 'Deutsch' },
    { code: 'en', label: 'English', required: true },
  ];
  const OPTIONAL_LOCALES: LocalizedTextLocale[] = [
    { code: 'de', label: 'Deutsch' },
    { code: 'en', label: 'English' },
  ];
  const ENGLISH_ONLY: LocalizedTextLocale[] = [{ code: 'en', label: 'English', required: true }];

  let translated = $state<Record<string, string | undefined>>({ en: 'Abstract', de: 'Zusammenfassung' });
  let partial = $state<Record<string, string | undefined>>({ en: 'Abstract' });
  let missingDefault = $state<Record<string, string | undefined>>({ de: 'Zusammenfassung' });
  let emptyOptional = $state<Record<string, string | undefined>>({});
  let multiline = $state<Record<string, string | undefined>>({ en: 'Bibliographic source, such as the publisher or journal.' });
  let preserved = $state<Record<string, string | undefined>>({ en: 'Abstract', de: 'Zusammenfassung' });
</script>

<SpecimenGrid title="One line: language select + input (each language posts name.code)">
  <Specimen label="translated everywhere (check in each option, no badge)" state="translated">
    <LocalizedTextField label="Label" name="label" locales={LABEL_LOCALES} bind:value={translated} {...words} />
  </Specimen>
  <Specimen label="a language missing (option state + 1/2 badge; copy helper on the empty one)" state="partial">
    <LocalizedTextField label="Label" name="label" locales={LABEL_LOCALES} bind:value={partial} {...words} />
  </Specimen>
  <Specimen label="required language empty (selected; field error, input invalid)" state="error">
    <LocalizedTextField label="Label" name="label" locales={LABEL_LOCALES} bind:value={missingDefault} {...words} error="Enter the label in English." />
  </Specimen>
  <Specimen label="optional field, empty everywhere (nothing is missing)" state="optional-empty">
    <LocalizedTextField label="Inverse label" name="inverseLabel" optionalLabel={OPTIONAL} locales={OPTIONAL_LOCALES} bind:value={emptyOptional} {...words} hint="The edge read from its target." />
  </Specimen>
  <Specimen label="multiline (a description)" state="multiline" wide>
    <LocalizedTextField label="Description" name="description" optionalLabel={OPTIONAL} locales={OPTIONAL_LOCALES} bind:value={multiline} multiline {...words} />
  </Specimen>
  <Specimen label="text in a disabled language is kept (hidden, posted, noted)" state="preserved">
    <LocalizedTextField label="Label" name="label" locales={ENGLISH_ONLY} bind:value={preserved} {...words} preservedNote="Also kept: Deutsch (not enabled)" />
  </Specimen>
</SpecimenGrid>
