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
  const selectElementBtn = document.getElementById('selectElementBtn');
  const cancelSelectionBtn = document.getElementById('cancelSelectionBtn');
  const statusDiv = document.getElementById('status');
  const settingsLink = document.getElementById('settingsLink');

  const uiLangResult = await chrome.storage.sync.get(['uiLanguage']);
  const uiLang = uiLangResult.uiLanguage || 'en';
  await loadI18n(uiLang);

  const result = await chrome.storage.sync.get(['fromLanguage', 'toLanguage']);
  if (result.fromLanguage) fromLanguageSelect.value = result.fromLanguage;
  if (result.toLanguage) toLanguageSelect.value = result.toLanguage;

  fromLanguageSelect.addEventListener('change', async () => {
    await chrome.storage.sync.set({ fromLanguage: fromLanguageSelect.value });
  });

  toLanguageSelect.addEventListener('change', async () => {
    await chrome.storage.sync.set({ toLanguage: toLanguageSelect.value });
  });

  settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  selectElementBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || 
          tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
        statusDiv.textContent = getMessage('errorInvalidPage') || 'Cannot translate this page type';
        statusDiv.className = 'status error';
        return;
      }

      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'startSelection',
          fromLanguage: fromLanguageSelect.value,
          toLanguage: toLanguageSelect.value
        });
      } catch (sendError) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/content.js']
        });
        
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content/content.css']
        });
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await chrome.tabs.sendMessage(tab.id, {
          action: 'startSelection',
          fromLanguage: fromLanguageSelect.value,
          toLanguage: toLanguageSelect.value
        });
      }

      selectElementBtn.disabled = true;
      cancelSelectionBtn.disabled = false;
      fromLanguageSelect.disabled = true;
      toLanguageSelect.disabled = true;
      statusDiv.textContent = getMessage('selectingStatus');
      statusDiv.className = 'status info';
      window.close();
    } catch (error) {
      statusDiv.textContent = (getMessage('error') || 'Error') + ': ' + error.message;
      statusDiv.className = 'status error';
    }
  });

  cancelSelectionBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { action: 'cancelSelection' });
      resetUI();
    } catch (error) {
      statusDiv.textContent = (getMessage('error') || 'Error') + ': ' + error.message;
      statusDiv.className = 'status error';
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'selectionComplete') {
      statusDiv.textContent = getMessage('translationComplete');
      statusDiv.className = 'status success';
      resetUI();
    } else if (message.action === 'selectionCancelled') {
      statusDiv.textContent = getMessage('selectionCancelled');
      statusDiv.className = 'status';
      resetUI();
    } else if (message.action === 'translationError') {
      statusDiv.textContent = (getMessage('translationError') || 'Error') + ': ' + message.error;
      statusDiv.className = 'status error';
      resetUI();
    }
  });

  function resetUI() {
    selectElementBtn.disabled = false;
    cancelSelectionBtn.disabled = true;
    fromLanguageSelect.disabled = false;
    toLanguageSelect.disabled = false;
  }
});
