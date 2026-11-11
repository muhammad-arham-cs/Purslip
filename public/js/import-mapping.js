document.addEventListener('DOMContentLoaded', () => {
  const modeSingle = document.getElementById('modeSingle');
  const modeDebitCredit = document.getElementById('modeDebitCredit');
  const singleField = document.getElementById('singleAmountField');
  const debitCreditFields = document.getElementById('debitCreditFields');

  if (!modeSingle || !modeDebitCredit) return;

  function sync() {
    const isSingle = modeSingle.checked;
    singleField.style.display = isSingle ? 'block' : 'none';
    debitCreditFields.style.display = isSingle ? 'none' : 'grid';
  }

  modeSingle.addEventListener('change', sync);
  modeDebitCredit.addEventListener('change', sync);
  sync();
});
