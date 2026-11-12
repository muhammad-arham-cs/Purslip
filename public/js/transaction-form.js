document.addEventListener('DOMContentLoaded', () => {
  const splitToggle = document.getElementById('splitToggle');
  const splitRows = document.getElementById('splitRows');
  const splitControls = document.getElementById('splitControls');
  const addSplitRowBtn = document.getElementById('addSplitRow');
  const splitRemaining = document.getElementById('splitRemaining');
  const template = document.getElementById('splitRowTemplate');
  const amountInput = document.getElementById('amount');
  const accountSelect = document.getElementById('accountId');
  const cardSelect = document.getElementById('cardId');
  const paymentMethodSelect = document.getElementById('paymentMethod');
  const payeeInput = document.getElementById('payee');
  const noteInput = document.getElementById('note');
  const detectBanner = document.getElementById('cardDetectBanner');
  const detectText = document.getElementById('cardDetectText');

  function showDetection(message) {
    if (!detectBanner || !detectText) return;
    if (!message) {
      detectBanner.hidden = true;
      return;
    }
    detectText.textContent = message;
    detectBanner.hidden = false;
  }

  // Sync card -> account + paymentMethod
  if (cardSelect && accountSelect && paymentMethodSelect) {
    cardSelect.addEventListener('change', () => {
      const selectedOption = cardSelect.options[cardSelect.selectedIndex];
      if (!selectedOption || !selectedOption.value) {
        showDetection('');
        return;
      }
      const linkedAccountId = selectedOption.dataset.accountId;
      const cardType = selectedOption.dataset.cardType;
      if (linkedAccountId) {
        accountSelect.value = linkedAccountId;
      }
      paymentMethodSelect.value = cardType === 'credit' ? 'credit_card' : 'debit_card';
      showDetection(`Linked ${cardType === 'credit' ? 'Credit' : 'Debit'} card selected — balance will update on the linked account.`);
    });

    // Smart auto-detection when typing payee or note
    const autoDetectFromText = () => {
      if (cardSelect.value) return;
      const text = `${payeeInput ? payeeInput.value : ''} ${noteInput ? noteInput.value : ''}`;
      if (!text.trim()) {
        showDetection('');
        return;
      }

      // 1. Check if text matches a card's last4 digits (e.g. *7890)
      const options = Array.from(cardSelect.options).filter((o) => o.value);
      for (const opt of options) {
        const last4 = opt.dataset.last4;
        if (last4 && new RegExp(`(?:\\*|•|ending\\s+|card\\s+|#)${last4}\\b`, 'i').test(text)) {
          cardSelect.value = opt.value;
          if (opt.dataset.accountId) accountSelect.value = opt.dataset.accountId;
          paymentMethodSelect.value = opt.dataset.cardType === 'credit' ? 'credit_card' : 'debit_card';
          showDetection(`Auto-detected card •••• ${last4} from description and linked its account.`);
          return;
        }
      }

      // 2. Check for general card transaction keywords
      if (/\b(pos|visa|mastercard|paypak|unionpay|debit\s*card|credit\s*card|swipe|contactless|atm)\b/i.test(text)) {
        const isCredit = /\bcredit\s*card\b/i.test(text);
        paymentMethodSelect.value = isCredit ? 'credit_card' : 'debit_card';
        const currentAcct = accountSelect.value;
        const acctCard = options.find((o) => o.dataset.accountId === currentAcct);
        if (acctCard) {
          cardSelect.value = acctCard.value;
          paymentMethodSelect.value = acctCard.dataset.cardType === 'credit' ? 'credit_card' : 'debit_card';
          showDetection(`Detected card transaction — auto-selected linked card (${acctCard.textContent.split('·')[0].trim()}).`);
        } else {
          showDetection(`Detected ${isCredit ? 'credit' : 'debit'} card transaction from description.`);
        }
      } else {
        showDetection('');
      }
    };

    if (payeeInput) payeeInput.addEventListener('input', autoDetectFromText);
    if (noteInput) noteInput.addEventListener('input', autoDetectFromText);
  }

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
