document.addEventListener('DOMContentLoaded', () => {
  const splitToggle = document.getElementById('splitToggle');
  const splitRows = document.getElementById('splitRows');
  const splitControls = document.getElementById('splitControls');
  const addSplitRowBtn = document.getElementById('addSplitRow');
  const splitRemaining = document.getElementById('splitRemaining');
  const template = document.getElementById('splitRowTemplate');
  const amountInput = document.getElementById('amount');

  if (!splitToggle || !splitRows) return;

  let nextIndex = splitRows.querySelectorAll('.split-row').length;

  function firstAmountInput() {
    return splitRows.querySelector('.split-amount');
  }

  function updateRemaining() {
    if (!splitToggle.checked) return;
    const total = Number(amountInput.value) || 0;
    const allocated = Array.from(splitRows.querySelectorAll('.split-amount')).reduce(
      (sum, input) => sum + (Number(input.value) || 0),
      0
    );
    const remaining = Math.round((total - allocated) * 100) / 100;
    splitRemaining.textContent =
      remaining === 0
        ? 'Fully allocated.'
        : `Remaining to allocate: ${remaining.toFixed(2)}`;
    splitRemaining.style.color = remaining === 0 ? 'var(--color-success)' : 'var(--color-warning)';
  }

  function setSplitMode(isSplit) {
    splitControls.style.display = isSplit ? 'block' : 'none';
    const amountFields = splitRows.querySelectorAll('.split-amount');
    if (!isSplit) {
      // Collapse back to a single row mirroring the transaction total.
      while (splitRows.querySelectorAll('.split-row').length > 1) {
        splitRows.querySelector('.split-row:last-child').remove();
      }
      const first = firstAmountInput();
      if (first) {
        first.readOnly = true;
        first.value = amountInput.value;
      }
    } else {
      amountFields.forEach((input) => {
        input.readOnly = false;
      });
      updateRemaining();
    }
  }

  splitToggle.addEventListener('change', () => setSplitMode(splitToggle.checked));

  if (amountInput) {
    amountInput.addEventListener('input', () => {
      if (!splitToggle.checked) {
        const first = firstAmountInput();
        if (first) first.value = amountInput.value;
      } else {
        updateRemaining();
      }
    });
  }

  splitRows.addEventListener('input', (e) => {
    if (e.target.classList.contains('split-amount')) updateRemaining();
  });

  if (addSplitRowBtn) {
    addSplitRowBtn.addEventListener('click', () => {
      const fragment = template.content.cloneNode(true);
      fragment.querySelectorAll('[name*="__INDEX__"]').forEach((el) => {
        el.name = el.name.replace('__INDEX__', String(nextIndex));
      });
      nextIndex += 1;
      splitRows.appendChild(fragment);
      updateRemaining();
    });
  }

  splitRows.addEventListener('click', (e) => {
    if (e.target.classList.contains('removeSplitRow')) {
      e.target.closest('.split-row').remove();
      updateRemaining();
    }
  });

  setSplitMode(splitToggle.checked);
});
