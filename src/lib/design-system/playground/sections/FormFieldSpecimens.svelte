<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import FormField from '../../FormField.svelte';
  import Input from '../../Input.svelte';
  import Textarea from '../../Textarea.svelte';
  import Select from '../../Select.svelte';
  import MultiSelect from '../../MultiSelect.svelte';
  import Combobox from '../../Combobox.svelte';
  import NumberField from '../../NumberField.svelte';
  import ChipInput from '../../ChipInput.svelte';
  import Button from '../../Button.svelte';
  import Alert from '../../Alert.svelte';
  import FieldError from '../../FieldError.svelte';
  import RadioGroup from '../../RadioGroup.svelte';
  import Specimen from '../Specimen.svelte';
  import SpecimenGrid from '../SpecimenGrid.svelte';

  const OPTIONAL = '(optional)';
  const kinds = [
    { value: 'page', label: 'Page' },
    { value: 'document', label: 'Document' },
  ];
  const fruits = [
    { value: 'apple', label: 'Apple' },
    { value: 'pear', label: 'Pear' },
  ];

  let slug = $state('getting-started');
  let label = $state('');
  let description = $state('');
  let kind = $state('page');
  let taken = $state('home');
  let kindError = $state('');
  let several = $state<string[]>([]);
  let font = $state<string | null>(null);
  let limit = $state<number | null>(300);
  let tags = $state<string[]>(['news']);
  let target = $state('page');
  let notes = $state('');
</script>

<SpecimenGrid title="Stacked field (label above, control, hint, warning, error)">
  <Specimen label="required (no marker; the control carries required)" state="required">
    <FormField label="Key"><Input name="slug" bind:value={slug} required /></FormField>
  </Specimen>
  <Specimen label="optional (optionalLabel after the label)" state="optional">
    <FormField label="Label" optionalLabel={OPTIONAL}><Input name="label" bind:value={label} placeholder="Shown instead of the key" /></FormField>
  </Specimen>
  <Specimen label="hint (aria-describedby)" state="hint">
    <FormField label="Description" optionalLabel={OPTIONAL} hint="One sentence; shown as a tooltip in the catalog.">
      <Input name="description" bind:value={description} />
    </FormField>
  </Specimen>
  <Specimen label="error (aria-invalid, danger border, described)" state="error">
    <FormField label="Key" error="This key is already taken in the namespace.">
      <Input name="slug" bind:value={taken} required />
    </FormField>
  </Specimen>
  <Specimen label="warning (allowed, with a consequence; described, not invalid)" state="warning">
    <FormField label="Default access" warning="3 pages inherit this access level and become public.">
      <Input name="access" value="Public" />
    </FormField>
  </Specimen>
  <Specimen label="hint and error together" state="hint-error">
    <FormField label="Key" hint="Lowercase letters, digits and hyphens." error="Only lowercase letters, digits and hyphens.">
      <Input name="slug" value="Not A Slug" required />
    </FormField>
  </Specimen>
  <Specimen label="Textarea" state="textarea">
    <FormField label="Notes" optionalLabel={OPTIONAL}><Textarea bind:value={notes} rows={3} /></FormField>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Every design-system control wires itself">
  <Specimen label="Select (listbox named by the label)" state="select" overlay>
    <FormField label="Kind" error={kindError || null}>
      <Select items={kinds} bind:value={kind} width="full" />
    </FormField>
    <Button size="sm" onclick={() => (kindError = kindError ? '' : 'Documents cannot be nested under a page.')}>Toggle error</Button>
  </Specimen>
  <Specimen label="MultiSelect, invalid" state="multiselect">
    <FormField label="Fruits" error="Pick at least one.">
      <MultiSelect items={fruits} bind:value={several} placeholder="Any fruit" width="full" />
    </FormField>
  </Specimen>
  <Specimen label="Combobox, hint" state="combobox">
    <FormField label="Font family" hint="Free text is allowed.">
      <Combobox value={font} options={['Inter', 'Georgia']} onValueChange={(v) => (font = v)} />
    </FormField>
  </Specimen>
  <Specimen label="NumberField, invalid" state="number">
    <FormField label="Width" error="At most 200 px.">
      <NumberField bind:value={limit} unit="px" />
    </FormField>
  </Specimen>
  <Specimen label="ChipInput, hint" state="chips">
    <FormField label="Tags" optionalLabel={OPTIONAL} hint="Enter adds a tag.">
      <ChipInput bind:value={tags} removeLabel="Remove" />
    </FormField>
  </Specimen>
  <Specimen label="raw element via the snippet argument (file input)" state="raw">
    <FormField label="File" hint="PDF, text or Markdown.">
      {#snippet children(field)}
        <input id={field.controlId} aria-describedby={field.describedBy} type="file" />
      {/snippet}
    </FormField>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="Group (not one control) and form layout">
  <Specimen label="group: a radio pair, role=group named by the label" state="group">
    <FormField label="Links to" group>
      <RadioGroup size="sm" items={[{ value: 'page', label: 'Page' }, { value: 'url', label: 'External URL' }]} bind:value={target} />
    </FormField>
  </Specimen>
  <Specimen label="a dialog form: two-column grid, a full-width field, the action error above the footer" state="form" wide>
    <form class="field-grid" onsubmit={(e) => e.preventDefault()}>
      <FormField label="Key"><Input name="k" value="article" required /></FormField>
      <FormField label="Label" optionalLabel={OPTIONAL}><Input name="l" value="Article" /></FormField>
      <div class="wide"><FormField label="Description" optionalLabel={OPTIONAL}><Input name="d" /></FormField></div>
      <div class="wide"><Alert tone="danger">The class could not be saved.</Alert></div>
    </form>
  </Specimen>
</SpecimenGrid>

<SpecimenGrid title="FieldError on its own (a control outside FormField and FieldRow)">
  <Specimen label="the control names it: aria-describedby + aria-invalid" state="field-error" wide>
    <div class="own">
      <div class="own-row">
        <Input size="sm" value="my name!" aria-label="Parameter name" aria-invalid="true" aria-describedby="pg-own-error" />
        <Button size="sm">Apply</Button>
      </div>
      <FieldError id="pg-own-error" message="Use letters, digits, underscores and hyphens only." />
    </div>
  </Specimen>
</SpecimenGrid>

<style>
  .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--ds-space-sm) var(--ds-space-md); max-width: 36rem; }
  .wide { grid-column: 1 / -1; }
  .own { display: flex; flex-direction: column; gap: 0.25rem; max-width: 24rem; }
  .own-row { display: flex; gap: var(--ds-space-sm); }
</style>
