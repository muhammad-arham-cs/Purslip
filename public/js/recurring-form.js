document.addEventListener('DOMContentLoaded', () => {
  const frequency = document.getElementById('frequency');
  const customField = document.getElementById('customIntervalField');
  if (!frequency || !customField) return;

  frequency.addEventListener('change', () => {
    customField.style.display = frequency.value === 'custom_days' ? 'block' : 'none';
  });
});
