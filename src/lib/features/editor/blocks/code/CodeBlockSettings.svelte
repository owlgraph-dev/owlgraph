<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { FieldRow, Select } from '$lib/design-system';
  import * as m from '$lib/paraglide/messages';
  import BlockSettingsSection from '../../blockSettings/BlockSettingsSection.svelte';
  import { anyAttrModified } from '../../blockSettings/modified';
  import { labelFor } from '../../blockSettings/blockLabels';
  import type { BlockSettingsProps } from '../../blockSettings/types';

  let { target, editor }: BlockSettingsProps = $props();

  const languages: { id: string; label: () => string }[] = [
    { id: 'plaintext', label: m.editor_block_settings_code_lang_plaintext },
    { id: 'bash', label: m.editor_block_settings_code_lang_bash },
    { id: 'c', label: m.editor_block_settings_code_lang_c },
    { id: 'cpp', label: m.editor_block_settings_code_lang_cpp },
    { id: 'css', label: m.editor_block_settings_code_lang_css },
    { id: 'go', label: m.editor_block_settings_code_lang_go },
    { id: 'xml', label: m.editor_block_settings_code_lang_xml },
    { id: 'java', label: m.editor_block_settings_code_lang_java },
    { id: 'javascript', label: m.editor_block_settings_code_lang_javascript },
    { id: 'json', label: m.editor_block_settings_code_lang_json },
    { id: 'markdown', label: m.editor_block_settings_code_lang_markdown },
    { id: 'python', label: m.editor_block_settings_code_lang_python },
    { id: 'rust', label: m.editor_block_settings_code_lang_rust },
    { id: 'sql', label: m.editor_block_settings_code_lang_sql },
    { id: 'typescript', label: m.editor_block_settings_code_lang_typescript },
    { id: 'yaml', label: m.editor_block_settings_code_lang_yaml },
  ];
</script>

<BlockSettingsSection id="block" title={labelFor(target.type)} modified={anyAttrModified(editor, target.type, target.attrs, ['language'])}>
  <FieldRow layout="stack" label={m.editor_block_settings_code_language_label()} info={m.editor_block_settings_code_hint()}>
    <Select
      size="sm"
      width="full"
      items={languages.map((l) => ({ value: l.id, label: l.label() }))}
      value={(target.attrs.language as string | undefined) ?? 'plaintext'}
      onValueChange={(v) => target.update({ language: v })}
      ariaLabel={m.editor_block_settings_code_language_label()}
    />
  </FieldRow>
</BlockSettingsSection>
