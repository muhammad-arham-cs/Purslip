document.addEventListener('DOMContentLoaded', () => {
  const forms = document.querySelectorAll('[data-inline-form]');

  forms.forEach((form) => {
    const key = form.dataset.inlineForm;
    const fields = form.querySelectorAll('[data-editable], input:not([type="hidden"]), select, textarea');
    const editor = form.querySelector('.settings-editor');
    const openButton = document.querySelector(`[data-open-editor="${key}"]`);
    const discardButtons = form.querySelectorAll('[data-discard]');
    const initial = Array.from(fields).map((field) => field.value);
    const formStartsHidden = form.hidden;

    const close = () => {
      fields.forEach((field, index) => {
        field.value = initial[index];
        field.readOnly = true;
        field.disabled = field.tagName === 'SELECT' || field.type === 'number';
      });
      form.querySelectorAll('input[type="password"]').forEach((field) => { field.value = ''; });
      if (editor) editor.hidden = true;
      if (formStartsHidden) form.hidden = true;
      if (openButton) openButton.hidden = false;
    };

    const open = () => {
      fields.forEach((field) => {
        field.readOnly = false;
        field.disabled = false;
      });
      form.hidden = false;
      if (editor) editor.hidden = false;
      if (openButton) openButton.hidden = true;
      fields[0]?.focus();
    };

    openButton?.addEventListener('click', open);
    discardButtons.forEach((button) => button.addEventListener('click', close));
    form.addEventListener('input', () => {
      const changed = Array.from(fields).some((field, index) => field.value !== initial[index]);
      const save = form.querySelector('[data-save]');
      if (save) save.hidden = !changed;
    });
  });

  document.querySelectorAll('[data-open-editor]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = document.querySelector(`[data-inline-form="${button.dataset.openEditor}"]`);
      if (target && !target.hidden) return;
      document.querySelectorAll('[data-inline-form]').forEach((form) => {
        if (form !== target && form.querySelector('[data-discard]')) form.querySelector('[data-discard]').click();
      });
    });
  });
});
