let i18nMessages = {};

async function loadI18n(lang) {
  try {
    const response = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
    i18nMessages = await response.json();
    applyI18n();
  } catch (error) {
    console.error('Error loading i18n:', error);
    if (lang !== 'en') loadI18n('en');
  }
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    if (i18nMessages[key]) {
      element.textContent = i18nMessages[key].message;
    }
  });
}

function getMessage(key) {
  return i18nMessages[key]?.message || key;
}

document.addEventListener('DOMContentLoaded', async () => {
  const fromLanguageSelect = document.getElementById('fromLanguage');
  const toLanguageSelect = document.getElementById('toLanguage');
  const uiLanguageSelect = document.getElementById('uiLanguage');
  const highlightColorInput = document.getElementById('highlightColor');
  const highlightOpacityInput = document.getElementById('highlightOpacity');
  const opacityValueSpan = document.getElementById('opacityValue');
  const preserveFormattingCheckbox = document.getElementById('preserveFormatting');
  const translateAttributesCheckbox = document.getElementById('translateAttributes');
  const showNotificationsCheckbox = document.getElementById('showNotifications');
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const statusDiv = document.getElementById('status');

  const uiLangResult = await chrome.storage.sync.get(['uiLanguage']);
  const uiLang = uiLangResult.uiLanguage || 'en';
  uiLanguageSelect.value = uiLang;
  await loadI18n(uiLang);
  await loadSettings();

  highlightOpacityInput.addEventListener('input', () => {
    opacityValueSpan.textContent = highlightOpacityInput.value;
  });

  saveBtn.addEventListener('click', saveSettings);
  resetBtn.addEventListener('click', resetSettings);

  uiLanguageSelect.addEventListener('change', async () => {
    const selectedLang = uiLanguageSelect.value;
    await chrome.storage.sync.set({ uiLanguage: selectedLang });
    await loadI18n(selectedLang);
  });

  async function loadSettings() {
    const result = await chrome.storage.sync.get([
      'fromLanguage',
      'toLanguage',
      'highlightColor',
      'highlightOpacity',
      'preserveFormatting',
      'translateAttributes',
      'showNotifications'
    ]);
    if (result.fromLanguage) fromLanguageSelect.value = result.fromLanguage;
    if (result.toLanguage) toLanguageSelect.value = result.toLanguage;
    if (result.highlightColor) highlightColorInput.value = result.highlightColor;
    if (result.highlightOpacity) {
      highlightOpacityInput.value = result.highlightOpacity;
      opacityValueSpan.textContent = result.highlightOpacity;
    }
    if (result.preserveFormatting !== undefined) preserveFormattingCheckbox.checked = result.preserveFormatting;
    if (result.translateAttributes !== undefined) translateAttributesCheckbox.checked = result.translateAttributes;
    if (result.showNotifications !== undefined) showNotificationsCheckbox.checked = result.showNotifications;
  }

  async function saveSettings() {
    try {
      await chrome.storage.sync.set({
        fromLanguage: fromLanguageSelect.value,
        toLanguage: toLanguageSelect.value,
        highlightColor: highlightColorInput.value,
        highlightOpacity: highlightOpacityInput.value,
        preserveFormatting: preserveFormattingCheckbox.checked,
        translateAttributes: translateAttributesCheckbox.checked,
        showNotifications: showNotificationsCheckbox.checked
      });
      showStatus(getMessage('settingsSaved'), 'success');
    } catch (error) {
      showStatus((getMessage('errorSaving') || 'Error') + ': ' + error.message, 'error');
    }
  }

  async function resetSettings() {
    const defaultSettings = {
      fromLanguage: 'auto',
      toLanguage: 'ru',
      highlightColor: '#00bfff',
      highlightOpacity: '0.3',
      preserveFormatting: false,
      translateAttributes: true,
      showNotifications: true
    };
    await chrome.storage.sync.set(defaultSettings);
    await loadSettings();
    showStatus(getMessage('settingsReset'), 'info');
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
    setTimeout(() => {
      statusDiv.className = 'status';
    }, 3000);
  }
});
