document.addEventListener('DOMContentLoaded', () => {
  const password = document.getElementById('password');
  const indicator = document.getElementById('passwordHelp');
  if (!password || !indicator) return;

  password.addEventListener('input', () => {
    const value = password.value;
    if (!value) {
      indicator.textContent = 'Use 8 or more characters.';
      indicator.dataset.strength = '';
      return;
    }

    let score = 0;
    if (value.length >= 8) score += 1;
    if (value.length >= 12) score += 1;
    if (/[A-Z]/.test(value)) score += 1;
    if (/[a-z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;

    const label = score <= 2 ? 'Weak' : score <= 4 ? 'Moderate' : 'Strong';
    indicator.textContent = `Password strength: ${label}.`;
    indicator.dataset.strength = label.toLowerCase();
  });
});
