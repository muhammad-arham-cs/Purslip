/**
 * PURSLIP — Authentication & System Pages Controller (Vanilla JS)
 * External same-origin script, strictly CSP-compliant (zero inline JS).
 * Preserves existing form field names, CSRF hidden inputs, CNIC/Phone formatting,
 * password visibility toggles, Dark/Night/Light themes, and English/Urdu localization.
 */
(function (global) {
  'use strict';

  global.PURSLIP_AUTH_LIVE_SUBMIT = true;

  var AUTH_ROUTES = {
    '/': 'landing',
    '/login': 'login',
    '/auth/login': 'login',
    '/register': 'register',
    '/signup': 'register',
    '/auth/signup': 'register',
    '/auth/register': 'register',
    '/forgot-password': 'forgot',
    '/auth/forgot-password': 'forgot',
    '/reset-password': 'reset',
    '/auth/reset-password': 'reset',
    '/404': '404',
    '/500': '500',
    '/403': '403'
  };

  var COUNTRY_META = {
    PK: { dial: '+92', currency: 'PKR', placeholder: '+92 300 1234567' },
    AE: { dial: '+971', currency: 'AED', placeholder: '+971 50 123 4567' },
    SA: { dial: '+966', currency: 'SAR', placeholder: '+966 50 123 4567' },
    GB: { dial: '+44', currency: 'GBP', placeholder: '+44 7700 900077' },
    US: { dial: '+1', currency: 'USD', placeholder: '+1 415 555 0132' }
  };

  var I18N = {
    en: {
      backToLanding: 'Back to Purslip',
      showPwd: 'Show',
      hidePwd: 'Hide',
      loginHeading: 'Welcome <em>back.</em>',
      loginSub: 'Your financial picture is waiting right where you left it.',
      loginBtn: 'Log in to Purslip',
      signupHeading: 'Start with a <em>clearer picture.</em>',
      signupSub: 'Create your private Purslip account and bring your financial life together.',
      signupBtn: 'Create my account',
      forgotHeading: "Let's get you <em>back in.</em>",
      forgotSub: 'Verify your account details to recover access to your Purslip ledger.',
      forgotBtn: 'Send reset link',
      resetHeading: 'Choose a <em>new password.</em>',
      resetSub: 'Enter and confirm your new password to restore access to your account.',
      resetBtn: 'Reset password',
      err404Heading: 'This page seems to have <em>wandered off.</em>',
      err404Sub: "The page you're looking for isn't where it should be.",
      err500Heading: "Something didn't go <em>as planned.</em>",
      err500Sub: "We couldn't complete your request right now. Please try again."
    },
    ur: {
      backToLanding: 'واپس ہوم پیج پر',
      showPwd: 'دکھائیں',
      hidePwd: 'چھپائیں',
      loginHeading: 'خوش <em>آمدید۔</em>',
      loginSub: 'آپ کا مکمل مالیاتی ریکارڈ وہیں موجود ہے جہاں آپ نے چھوڑا تھا۔',
      loginBtn: 'پرسلپ میں لاگ ان کریں',
      signupHeading: 'ایک واضح مالیاتی <em>تصویر سے آغاز کریں۔</em>',
      signupSub: 'اپنا ذاتی پرسلپ اکاؤنٹ بنائیں اور اپنے تمام مالی معاملات کو منظم کریں۔',
      signupBtn: 'میرا اکاؤنٹ بنائیں',
      forgotHeading: 'آئیے آپ کا اکاؤنٹ <em>بحال کریں۔</em>',
      forgotSub: 'پاس ورڈ ری سیٹ لنک حاصل کرنے کے لیے اپنی ای میل اور شناختی کارڈ نمبر درج کریں۔',
      forgotBtn: 'ری سیٹ لنک بھیجیں',
      resetHeading: 'نیا پاس ورڈ <em>منتخب کریں۔</em>',
      resetSub: 'اپنے پرسلپ اکاؤنٹ کو محفوظ رکھنے کے لیے مضبوط نیا پاس ورڈ درج کریں۔',
      resetBtn: 'پاس ورڈ تبدیل کریں',
      err404Heading: 'یہ صفحہ <em>دستیاب نہیں ہے۔</em>',
      err404Sub: 'جس صفحے کو آپ تلاش کر رہے ہیں وہ یہاں موجود نہیں ہے۔',
      err500Heading: 'کچھ غیر متوقع <em>مسئلہ پیش آگیا۔</em>',
      err500Sub: 'ہم اس وقت آپ کی درخواست مکمل نہیں کر سکے۔ براہ کرم دوبارہ کوشش کریں۔'
    }
  };

  function formatCnic(raw) {
    var digits = String(raw || '').replace(/\D/g, '').slice(0, 13);
    if (digits.length <= 5) return digits;
    if (digits.length <= 12) return digits.slice(0, 5) + '-' + digits.slice(5);
    return digits.slice(0, 5) + '-' + digits.slice(5, 12) + '-' + digits.slice(12, 13);
  }

  function isValidCnic(val) {
    var clean = String(val || '').replace(/\D/g, '');
    return clean.length === 13;
  }

  function formatPhone(raw) {
    var trimmed = String(raw || '').trim();
    var hasPlus = trimmed.indexOf('+') === 0;
    var digits = trimmed.replace(/\D/g, '').slice(0, 14);
    if (!digits) return hasPlus ? '+' : '';
    if (digits.indexOf('92') === 0 && digits.length > 2) {
      var rest = digits.slice(2);
      if (rest.length <= 3) return '+92 ' + rest;
      return '+92 ' + rest.slice(0, 3) + ' ' + rest.slice(3, 10);
    }
    if (digits.indexOf('03') === 0 && digits.length > 4) {
      return digits.slice(0, 4) + '-' + digits.slice(4, 11);
    }
    return (hasPlus ? '+' : '') + digits;
  }

  function isValidEmail(val) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val || '').trim());
  }

  function checkPasswordRules(pwd, confirmPwd) {
    var p = String(pwd || '');
    var c = String(confirmPwd || '');
    var minLength = p.length >= 8;
    var hasMixedCase = /[a-z]/.test(p) && /[A-Z]/.test(p);
    var hasNumber = /\d/.test(p);
    var matchesConfirm = p.length > 0 && p === c;
    return {
      minLength: minLength,
      hasMixedCase: hasMixedCase,
      hasNumber: hasNumber,
      matchesConfirm: matchesConfirm,
      isValid: minLength && hasMixedCase && hasNumber
    };
  }

  var state = {
    activeView: 'login',
    theme: 'dark',
    lang: 'en',
    resetTokenState: 'valid' // 'valid' | 'expired'
  };

  function getStoredTheme() {
    try {
      return localStorage.getItem('purslip_theme') || 'dark';
    } catch (_e) {
      return 'dark';
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem('purslip_theme', theme);
    } catch (_e) {
      // Ignore storage restrictions
    }
  }

  function applyTheme(theme) {
    state.theme = theme;
    saveTheme(theme);
    var shell = document.getElementById('purslip-auth-shell');
    if (shell) {
      shell.setAttribute('data-theme', theme);
    }
    document.querySelectorAll('[data-auth-theme]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-auth-theme') === theme));
    });
  }

  function applyLanguage(lang) {
    state.lang = lang === 'ur' ? 'ur' : 'en';
    var shell = document.getElementById('purslip-auth-shell');
    if (shell) {
      shell.setAttribute('dir', state.lang === 'ur' ? 'rtl' : 'ltr');
      shell.setAttribute('lang', state.lang);
    }
    document.querySelectorAll('[data-auth-lang]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-auth-lang') === state.lang));
    });

    var dict = I18N[state.lang];
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      if (dict[key]) el.innerHTML = dict[key];
    });
    document.querySelectorAll('[data-i18n-text]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-text');
      if (dict[key]) el.textContent = dict[key];
    });

    // Update password toggle labels
    document.querySelectorAll('[data-password-toggle]').forEach(function (btn) {
      var isShown = btn.getAttribute('aria-pressed') === 'true';
      btn.textContent = isShown ? dict.hidePwd : dict.showPwd;
    });
  }

  function showView(viewName, updateHistory) {
    var landingEl = document.getElementById('purslip-landing');
    var authShell = document.getElementById('purslip-auth-shell');

    if (viewName === 'landing') {
      window.location.href = '/';
      return;
    }

    if (!authShell) {
      var urlMap = {
        login: '/auth/login',
        register: '/auth/signup',
        forgot: '/auth/forgot-password',
        reset: '/auth/reset-password',
        '404': '/404',
        '500': '/500',
        '403': '/403'
      };
      if (urlMap[viewName]) window.location.href = urlMap[viewName];
      return;
    }

    state.activeView = viewName;
    authShell.classList.remove('ps-view-hidden');

    // Toggle active sub-page inside #purslip-auth-shell
    document.querySelectorAll('[data-auth-page]').forEach(function (section) {
      var pageKey = section.getAttribute('data-auth-page');
      if (pageKey === viewName) {
        section.classList.remove('ps-view-hidden');
      } else {
        section.classList.add('ps-view-hidden');
      }
    });

    // Update top switcher aria-current
    document.querySelectorAll('[data-switch-view]').forEach(function (btn) {
      var target = btn.getAttribute('data-switch-view');
      if (target === viewName) {
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('aria-current');
      }
    });

    if (updateHistory && window.history && window.history.pushState) {
      var urlMap = {
        login: '/auth/login',
        register: '/auth/signup',
        forgot: '/auth/forgot-password',
        reset: '/auth/reset-password',
        '404': '/404',
        '500': '/500',
        '403': '/403'
      };
      window.history.pushState({ view: viewName }, '', urlMap[viewName] || '/auth/login');
    }

    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function syncViewFromLocation() {
    var path = window.location.pathname.replace(/\/+$/, '') || '/';
    var params = new URLSearchParams(window.location.search);
    var queryPage = params.get('page');

    if (params.get('expired') === '1') {
      setResetTokenState('expired');
    }

    if (queryPage && (queryPage === 'landing' || AUTH_ROUTES['/' + queryPage] || queryPage === 'forgot' || queryPage === 'reset')) {
      showView(queryPage, false);
      return;
    }

    if (path.indexOf('/auth/reset-password/') === 0 || path.indexOf('/reset-password/') === 0) {
      showView('reset', false);
      return;
    }

    if (AUTH_ROUTES[path]) {
      showView(AUTH_ROUTES[path], false);
      return;
    }
  }

  function setResetTokenState(tokenState) {
    state.resetTokenState = tokenState === 'expired' ? 'expired' : 'valid';
    var validBox = document.getElementById('ps-reset-valid-container');
    var expiredBox = document.getElementById('ps-reset-expired-container');
    if (validBox && expiredBox) {
      validBox.hidden = state.resetTokenState === 'expired';
      expiredBox.hidden = state.resetTokenState !== 'expired';
    }
    document.querySelectorAll('[data-reset-state-btn]').forEach(function (btn) {
      btn.setAttribute(
        'aria-pressed',
        String(btn.getAttribute('data-reset-state-btn') === state.resetTokenState)
      );
    });
  }

  function setFieldError(inputEl, errId, message) {
    var errEl = document.getElementById(errId);
    if (inputEl) {
      inputEl.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
    if (errEl) {
      errEl.textContent = message || '';
      errEl.hidden = !message;
    }
  }

  function showFormAlert(alertId, type, message) {
    var alertEl = document.getElementById(alertId);
    if (!alertEl) return;
    if (!message) {
      alertEl.hidden = true;
      alertEl.textContent = '';
      return;
    }
    alertEl.className =
      'ps-alert ' + (type === 'success' ? 'ps-alert-success' : 'ps-alert-error');
    alertEl.textContent = message;
    alertEl.hidden = false;
  }

  function initPasswordToggles() {
    document.querySelectorAll('[data-password-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-password-toggle');
        var input = document.getElementById(targetId);
        if (!input) return;
        var isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.setAttribute('aria-pressed', String(isPassword));
        var dict = I18N[state.lang] || I18N.en;
        btn.textContent = isPassword ? dict.hidePwd : dict.showPwd;
      });
    });
  }

  function initCnicAndPhoneMasks() {
    document.querySelectorAll('[data-cnic-input]').forEach(function (input) {
      input.addEventListener('input', function () {
        var cursor = input.selectionStart;
        var prevLen = input.value.length;
        input.value = formatCnic(input.value);
        if (cursor !== null && input.selectionEnd !== null) {
          var diff = input.value.length - prevLen;
          input.setSelectionRange(cursor + diff, cursor + diff);
        }
      });
    });

    document.querySelectorAll('[data-phone-input]').forEach(function (input) {
      input.addEventListener('input', function () {
        input.value = formatPhone(input.value);
      });
    });

    var countrySelect = document.getElementById('signup-country');
    var phoneInput = document.getElementById('signup-phone');
    if (countrySelect && phoneInput) {
      countrySelect.addEventListener('change', function () {
        var meta = COUNTRY_META[countrySelect.value];
        if (meta) {
          phoneInput.placeholder = meta.placeholder;
          if (!phoneInput.value || phoneInput.value.indexOf('+') !== 0) {
            phoneInput.value = meta.dial + ' ';
          }
        }
      });
    }
  }

  function bindPasswordRuleChecklist(pwdId, confirmId, rulesContainerId) {
    var pwdInput = document.getElementById(pwdId);
    var confInput = document.getElementById(confirmId);
    var container = document.getElementById(rulesContainerId);
    if (!pwdInput || !container) return;

    function updateChecklist() {
      var res = checkPasswordRules(pwdInput.value, confInput ? confInput.value : '');
      var rulesMap = {
        length: res.minLength,
        case: res.hasMixedCase,
        number: res.hasNumber,
        match: res.matchesConfirm
      };
      Object.keys(rulesMap).forEach(function (key) {
        var el = container.querySelector('[data-pwd-rule="' + key + '"]');
        if (el) {
          el.setAttribute('data-met', String(rulesMap[key]));
        }
      });
    }

    pwdInput.addEventListener('input', updateChecklist);
    if (confInput) {
      confInput.addEventListener('input', updateChecklist);
    }
  }

  function initForms() {
    bindPasswordRuleChecklist('signup-password', 'signup-confirmPassword', 'signup-pwd-rules');
    bindPasswordRuleChecklist('reset-password', 'reset-confirmPassword', 'reset-pwd-rules');

    // 1. LOGIN FORM
    var loginForm = document.getElementById('ps-login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', function (e) {
        var emailEl = document.getElementById('login-email');
        var pwdEl = document.getElementById('login-password');
        var valid = true;

        if (!emailEl || !isValidEmail(emailEl.value)) {
          setFieldError(emailEl, 'login-email-error', 'Please enter a valid email address.');
          valid = false;
        } else {
          setFieldError(emailEl, 'login-email-error', '');
        }

        if (!pwdEl || !pwdEl.value || pwdEl.value.length < 1) {
          setFieldError(pwdEl, 'login-password-error', 'Please enter your account password.');
          valid = false;
        } else {
          setFieldError(pwdEl, 'login-password-error', '');
        }

        if (!valid) {
          e.preventDefault();
          showFormAlert('login-form-alert', 'error', 'Please review the highlighted fields before signing in.');
          return;
        }

        if (global.PURSLIP_AUTH_LIVE_SUBMIT) {
          var submitBtn = document.getElementById('login-submit-btn');
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Signing in...';
          }
          return; // Let standard POST proceed to Express backend
        }

        e.preventDefault();
      });
    }

    // 2. SIGNUP FORM
    var signupForm = document.getElementById('ps-signup-form');
    if (signupForm) {
      signupForm.addEventListener('submit', function (e) {
        var fullNameEl = document.getElementById('signup-fullName');
        var countryEl = document.getElementById('signup-country');
        var phoneEl = document.getElementById('signup-phone');
        var cnicEl = document.getElementById('signup-cnic');
        var currencyEl = document.getElementById('signup-baseCurrency');
        var emailEl = document.getElementById('signup-email');
        var pwdEl = document.getElementById('signup-password');
        var confEl = document.getElementById('signup-confirmPassword');

        var valid = true;

        if (fullNameEl && (!fullNameEl.value || fullNameEl.value.trim().length < 2)) {
          setFieldError(fullNameEl, 'signup-fullName-error', 'Please enter your full name.');
          valid = false;
        } else if (fullNameEl) {
          setFieldError(fullNameEl, 'signup-fullName-error', '');
        }

        if (phoneEl && phoneEl.value && String(phoneEl.value).replace(/\D/g, '').length < 7) {
          setFieldError(phoneEl, 'signup-phone-error', 'Enter a valid phone number.');
          valid = false;
        } else if (phoneEl) {
          setFieldError(phoneEl, 'signup-phone-error', '');
        }

        if (cnicEl && cnicEl.value && !isValidCnic(cnicEl.value)) {
          setFieldError(cnicEl, 'signup-cnic-error', 'Enter a valid 13-digit CNIC (XXXXX-XXXXXXX-X).');
          valid = false;
        } else if (cnicEl) {
          setFieldError(cnicEl, 'signup-cnic-error', '');
        }

        if (!emailEl || !isValidEmail(emailEl.value)) {
          setFieldError(emailEl, 'signup-email-error', 'Enter a valid email address.');
          valid = false;
        } else {
          setFieldError(emailEl, 'signup-email-error', '');
        }

        var pwdRes = checkPasswordRules(pwdEl ? pwdEl.value : '', confEl ? confEl.value : '');
        if (!pwdRes.minLength) {
          setFieldError(pwdEl, 'signup-password-error', 'Password must be at least 8 characters.');
          valid = false;
        } else {
          setFieldError(pwdEl, 'signup-password-error', '');
        }

        if (!pwdRes.matchesConfirm) {
          setFieldError(confEl, 'signup-confirmPassword-error', 'Confirmation password does not match.');
          valid = false;
        } else {
          setFieldError(confEl, 'signup-confirmPassword-error', '');
        }

        if (!valid) {
          e.preventDefault();
          showFormAlert('signup-form-alert', 'error', 'Please complete all required registration fields accurately.');
          return;
        }

        if (global.PURSLIP_AUTH_LIVE_SUBMIT) {
          var submitBtn = document.getElementById('signup-submit-btn');
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating account...';
          }
          return; // Let standard POST proceed to Express backend
        }

        e.preventDefault();
      });
    }

    // 3. FORGOT PASSWORD FORM
    var forgotForm = document.getElementById('ps-forgot-form');
    if (forgotForm) {
      forgotForm.addEventListener('submit', function (e) {
        var emailEl = document.getElementById('forgot-email');
        var cnicEl = document.getElementById('forgot-cnic');
        var valid = true;

        if (!emailEl || !isValidEmail(emailEl.value)) {
          setFieldError(emailEl, 'forgot-email-error', 'Enter the email address registered to your account.');
          valid = false;
        } else {
          setFieldError(emailEl, 'forgot-email-error', '');
        }

        if (!cnicEl || !isValidCnic(cnicEl.value)) {
          setFieldError(cnicEl, 'forgot-cnic-error', 'Enter your 13-digit CNIC (XXXXX-XXXXXXX-X).');
          valid = false;
        } else {
          setFieldError(cnicEl, 'forgot-cnic-error', '');
        }

        if (!valid) {
          e.preventDefault();
          showFormAlert('forgot-form-alert', 'error', 'Both your registered email and 13-digit CNIC are required.');
          return;
        }

        if (global.PURSLIP_AUTH_LIVE_SUBMIT) {
          var submitBtn = document.getElementById('forgot-submit-btn');
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Verifying details...';
          }
          return; // Let standard POST proceed
        }

        e.preventDefault();
      });
    }

    // 4. RESET PASSWORD FORM
    var resetForm = document.getElementById('ps-reset-form');
    if (resetForm) {
      resetForm.addEventListener('submit', function (e) {
        var pwdEl = document.getElementById('reset-password');
        var confEl = document.getElementById('reset-confirmPassword');
        var pwdRes = checkPasswordRules(pwdEl ? pwdEl.value : '', confEl ? confEl.value : '');
        var valid = true;

        if (!pwdRes.minLength) {
          setFieldError(pwdEl, 'reset-password-error', 'Password must be at least 8 characters.');
          valid = false;
        } else {
          setFieldError(pwdEl, 'reset-password-error', '');
        }

        if (!pwdRes.matchesConfirm) {
          setFieldError(confEl, 'reset-confirmPassword-error', 'Passwords do not match.');
          valid = false;
        } else {
          setFieldError(confEl, 'reset-confirmPassword-error', '');
        }

        if (!valid) {
          e.preventDefault();
          showFormAlert('reset-form-alert', 'error', 'Please satisfy all password security requirements.');
          return;
        }

        if (global.PURSLIP_AUTH_LIVE_SUBMIT) {
          var submitBtn = document.getElementById('reset-submit-btn');
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Updating password...';
          }
          return; // Let standard POST proceed
        }

        e.preventDefault();
      });
    }
  }

  function initNavigationHandlers() {
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-switch-view], [data-route]');
      if (!trigger) return;

      var switchTarget = trigger.getAttribute('data-switch-view');
      if (switchTarget) {
        if (switchTarget === 'landing') {
          var landingEl = document.getElementById('purslip-landing');
          if (!landingEl) {
            window.location.href = '/';
            return;
          }
          e.preventDefault();
          showView('landing', true);
          return;
        }

        var targetSection = document.getElementById('ps-page-' + switchTarget);
        if (targetSection) {
          e.preventDefault();
          showView(switchTarget, true);
          return;
        }

        var urlMap = {
          login: '/auth/login',
          register: '/auth/signup',
          forgot: '/auth/forgot-password',
          reset: '/auth/reset-password',
          '404': '/404',
          '500': '/500',
          '403': '/403'
        };
        if (urlMap[switchTarget]) {
          window.location.href = urlMap[switchTarget];
        }
        return;
      }

      var routeKey = trigger.getAttribute('data-route');
      if (routeKey === 'dashboard') {
        window.location.href = '/dashboard';
        return;
      }
      if (routeKey === 'login') {
        var loginSection = document.getElementById('ps-page-login');
        if (loginSection) {
          e.preventDefault();
          showView('login', true);
        } else {
          window.location.href = '/auth/login';
        }
        return;
      }
      if (routeKey === 'register') {
        var regSection = document.getElementById('ps-page-register');
        if (regSection) {
          e.preventDefault();
          showView('register', true);
        } else {
          window.location.href = '/auth/signup';
        }
        return;
      }
    });

    // Theme buttons inside auth shell
    document.querySelectorAll('[data-auth-theme]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyTheme(btn.getAttribute('data-auth-theme'));
      });
    });

    // Language buttons inside auth shell
    document.querySelectorAll('[data-auth-lang]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyLanguage(btn.getAttribute('data-auth-lang'));
      });
    });

    // Reset token valid/expired preview state toggle
    document.querySelectorAll('[data-reset-state-btn]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setResetTokenState(btn.getAttribute('data-reset-state-btn'));
      });
    });

    // 500 error page "Try again" button
    var retryBtn = document.getElementById('ps-500-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', function () {
        var statusEl = document.getElementById('ps-500-retry-status');
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.textContent = 'Retrying connection to Purslip ledger service...';
        }
        setTimeout(function () {
          window.location.reload();
        }, 300);
      });
    }

    window.addEventListener('popstate', function () {
      syncViewFromLocation();
    });
  }

  function init() {
    applyTheme(getStoredTheme());
    initPasswordToggles();
    initCnicAndPhoneMasks();
    initForms();
    initNavigationHandlers();
    syncViewFromLocation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
