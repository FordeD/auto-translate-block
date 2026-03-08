let isSelectionMode = false;
let selectedElement = null;
let highlightOverlay = null;
let fromLanguage = 'auto';
let toLanguage = 'en';
let uiLanguage = 'en';

let settings = {
  highlightColor: '#00bfff',
  highlightOpacity: 0.3,
  preserveFormatting: false,
  translateAttributes: true,
  showNotifications: true
};

loadSettings();
loadUILanguage();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startSelection') {
    startSelection(message.fromLanguage, message.toLanguage);
    sendResponse({ success: true });
  } else if (message.action === 'cancelSelection') {
    cancelSelection();
    sendResponse({ success: true });
  } else if (message.action === 'getSettings') {
    sendResponse(settings);
  }
  return true;
});

async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get([
      'highlightColor',
      'highlightOpacity',
      'preserveFormatting',
      'translateAttributes',
      'showNotifications'
    ]);
    settings = { ...settings, ...result };
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

async function loadUILanguage() {
  try {
    const result = await chrome.storage.sync.get(['uiLanguage']);
    uiLanguage = result.uiLanguage || 'en';
  } catch (error) {
    console.error('Error loading UI language:', error);
  }
}

const messages = {
  en: {
    translating: 'Translating...',
    translationComplete: 'Translation complete!',
    translationFailed: 'Translation failed. See console for details.'
  },
  ru: {
    translating: 'Переводим...',
    translationComplete: 'Перевод завершён!',
    translationFailed: 'Перевод не удался. Подробности в консоли.'
  }
};

function getMessage(key) {
  return messages[uiLanguage]?.[key] || messages.en?.[key] || key;
}

function startSelection(fromLang, toLang) {
  isSelectionMode = true;
  fromLanguage = fromLang || 'auto';
  toLanguage = toLang || 'en';
  createHighlightOverlay();
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyDown, true);
}

function cancelSelection() {
  isSelectionMode = false;
  selectedElement = null;
  removeHighlightOverlay();
  document.removeEventListener('mousemove', handleMouseMove, true);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('keydown', handleKeyDown, true);
  chrome.runtime.sendMessage({ action: 'selectionCancelled' });
}

function createHighlightOverlay() {
  if (highlightOverlay) return;
  highlightOverlay = document.createElement('div');
  highlightOverlay.id = 'auto-translate-highlight';
  highlightOverlay.style.cssText = `
    position: fixed;
    pointer-events: none;
    border: 2px solid ${settings.highlightColor};
    background-color: ${settings.highlightColor};
    opacity: ${settings.highlightOpacity};
    z-index: 2147483647;
    transition: all 0.1s ease;
    display: none;
  `;
  document.body.appendChild(highlightOverlay);
}

function removeHighlightOverlay() {
  if (highlightOverlay) {
    highlightOverlay.remove();
    highlightOverlay = null;
  }
}

function updateHighlight(element) {
  if (!highlightOverlay || !element) return;
  const rect = element.getBoundingClientRect();
  highlightOverlay.style.display = 'block';
  highlightOverlay.style.left = rect.left + 'px';
  highlightOverlay.style.top = rect.top + 'px';
  highlightOverlay.style.width = rect.width + 'px';
  highlightOverlay.style.height = rect.height + 'px';
}

function handleMouseMove(e) {
  if (!isSelectionMode) return;
  const target = e.target;
  if (target === highlightOverlay) return;
  updateHighlight(target);
}

function handleClick(e) {
  if (!isSelectionMode) return;
  e.preventDefault();
  e.stopPropagation();
  const target = e.target;
  if (target === highlightOverlay) return;
  selectedElement = target;
  endSelection();
  translateElement(selectedElement);
}

function handleKeyDown(e) {
  if (!isSelectionMode) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    cancelSelection();
  }
}

function endSelection() {
  isSelectionMode = false;
  removeHighlightOverlay();
  document.removeEventListener('mousemove', handleMouseMove, true);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('keydown', handleKeyDown, true);
}

async function translateElement(element) {
  if (!element) return;
  try {
    showNotification(getMessage('translating'), 'idle');
    await translateNode(element);
    if (settings.translateAttributes) {
      await translateAttributes(element);
    }
    showNotification(getMessage('translationComplete'), 'success');
    chrome.runtime.sendMessage({ action: 'selectionComplete' });
  } catch (error) {
    console.error('Translation error:', error);
    showNotification(getMessage('translationFailed'), 'error');
    chrome.runtime.sendMessage({ action: 'translationError', error: error.message });
  }
}

function collectTextNodes(node, textNodes = []) {
  const skipTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS', 'CODE', 'PRE'];
  
  if (!node) {
    return textNodes;
  }
  
  if (node.nodeType === 1 && skipTags.includes(node.tagName)) {
    return textNodes;
  }
  
  if (node.nodeType === 3) {
    const text = node.textContent;
    const trimmedText = text.trim();
    if (trimmedText) {
      textNodes.push({ node, text, trimmedText, leadingWhitespace: text.match(/^\s*/)?.[0] || '', trailingWhitespace: text.match(/\s*$/)?.[0] || '' });
    }
    return textNodes;
  }
  
  if (node.nodeType === 1) {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      collectTextNodes(child, textNodes);
    }
  }
  
  return textNodes;
}

async function translateTextBatch(texts) {
  const sourceLang = fromLanguage === 'auto' ? 'auto' : fromLanguage;
  const targetLang = toLanguage;

  const body = {
    texts: texts,
    from: sourceLang,
    to: targetLang
  };

  const authHeaders = await AuthUtils.generateAuthHeaders('POST', '/translate/batch', body);

  const response = await fetch('https://auto-translate-block.onrender.com/translate/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Proxy server error: ${response.status} - ${errorData.error || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.translations;
}

async function translateNode(node) {
  const skipTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS', 'CODE', 'PRE'];
  if (node.nodeType === 1 && skipTags.includes(node.tagName)) {
    return;
  }

  const textNodes = collectTextNodes(node, []);

  if (!textNodes || textNodes.length === 0) {
    return;
  }

  try {
    const textsToTranslate = textNodes.map(t => t.trimmedText);
    const translations = await translateTextBatch(textsToTranslate);

    for (let i = 0; i < textNodes.length; i++) {
      const { node: textNode, leadingWhitespace, trailingWhitespace } = textNodes[i];
      const translated = translations[i];

      if (translated && translated !== textNodes[i].trimmedText) {
        textNode.textContent = leadingWhitespace + translated + trailingWhitespace;
      }
    }
  } catch (error) {
    console.error('[translateNode] Error:', error);
  }
}

async function translateAttributes(element) {
  const attributesToTranslate = ['alt', 'title', 'placeholder', 'aria-label', 'aria-description'];
  const attrsToTranslate = [];
  const attrInfos = [];
  
  attributesToTranslate.forEach(attr => {
    if (element.hasAttribute(attr)) {
      const value = element.getAttribute(attr);
      if (value) {
        element.setAttribute(`data-original-${attr}`, value);
        attrsToTranslate.push(value);
        attrInfos.push({ attr, originalValue: value });
      }
    }
  });
  
  if (attrsToTranslate.length === 0) {
    return;
  }
  
  try {
    const translations = await translateTextBatch(attrsToTranslate);
    
    for (let i = 0; i < attrInfos.length; i++) {
      const { attr, originalValue } = attrInfos[i];
      const translated = translations[i];
      
      if (translated && translated !== originalValue) {
        element.setAttribute(attr, translated);
      }
    }
  } catch (error) {
    console.error('[TranslateAttributes] Error:', error);
  }
}

function showNotification(message, type = 'info') {
  if (!settings.showNotifications) return;
  const existing = document.getElementById('auto-translate-notification');
  if (existing) existing.remove();
  
  const notification = document.createElement('div');
  notification.id = 'auto-translate-notification';
  
  const colors = {
    success: { bg: '#1e8e3e', text: '#fff' },
    error: { bg: '#d93025', text: '#fff' },
    info: { bg: '#1a73e8', text: '#fff' },
    idle: { bg: '#ff9800', text: '#fff' }
  };
  const color = colors[type] || colors.info;
  
  const spinner = type === 'idle' ? '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:8px;vertical-align:middle;"></span>' : '';
  
  notification.innerHTML = spinner + '<span style="vertical-align:middle;">' + message + '</span>';
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background-color: ${color.bg};
    color: ${color.text};
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: 2147483647;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    animation: slideIn 0.3s ease;
    display: flex;
    align-items: center;
  `;
  document.body.appendChild(notification);
  
  if (type !== 'idle') {
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);
