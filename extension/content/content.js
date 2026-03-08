let isSelectionMode = false;
let selectedElement = null;
let highlightOverlay = null;
let fromLanguage = 'auto';
let toLanguage = 'en';

let settings = {
  highlightColor: '#00bfff',
  highlightOpacity: 0.3,
  preserveFormatting: false,
  translateAttributes: true,
  showNotifications: true
};

loadSettings();

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
    showNotification('Translating...', 'info');
    await translateNode(element);
    if (settings.translateAttributes) {
      translateAttributes(element);
    }
    showNotification('Translation complete!', 'success');
    chrome.runtime.sendMessage({ action: 'selectionComplete' });
  } catch (error) {
    console.error('Translation error:', error);
    showNotification('Translation error: ' + error.message, 'error');
    chrome.runtime.sendMessage({ action: 'translationError', error: error.message });
  }
}

async function translateNode(node) {
  const skipTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS', 'CODE', 'PRE'];
  if (node.nodeType === 1 && skipTags.includes(node.tagName)) {
    return;
  }
  if (node.nodeType === 3) {
    const text = node.textContent;
    const trimmedText = text.trim();
    if (trimmedText) {
      try {
        const translated = await translateText(trimmedText);
        if (translated && translated !== trimmedText) {
          const leadingWhitespace = text.match(/^\s*/)?.[0] || '';
          const trailingWhitespace = text.match(/\s*$/)?.[0] || '';
          node.textContent = leadingWhitespace + translated + trailingWhitespace;
        }
      } catch (error) {
        console.error('[TranslateNode] Error:', error);
      }
    }
  } else if (node.nodeType === 1) {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      await translateNode(child);
    }
  }
}

function translateAttributes(element) {
  const attributesToTranslate = ['alt', 'title', 'placeholder', 'aria-label', 'aria-description'];
  attributesToTranslate.forEach(attr => {
    if (element.hasAttribute(attr)) {
      const value = element.getAttribute(attr);
      if (value) {
        element.setAttribute(`data-original-${attr}`, value);
        translateText(value).then(translated => {
          if (translated && translated !== value) {
            element.setAttribute(attr, translated);
          }
        });
      }
    }
  });
}

const MAX_URL_LENGTH = 2000;
const PROXY_SERVER_URL = 'http://localhost:3000/translate';
const PROXY_SERVER_PATH = '/translate';

function splitTextForTranslation(text, sourceLang, targetLang) {
  const chunks = [];
  let currentChunk = '';
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];
  for (const sentence of sentences) {
    const testChunk = currentChunk ? currentChunk + sentence : sentence;
    const estimatedSize = encodeURIComponent(testChunk).length + 200;
    if (estimatedSize <= MAX_URL_LENGTH) {
      currentChunk = testChunk;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      if (encodeURIComponent(sentence).length + 200 <= MAX_URL_LENGTH) {
        currentChunk = sentence;
      } else {
        const words = sentence.split(/\s+/);
        currentChunk = '';
        for (const word of words) {
          const testWord = currentChunk ? currentChunk + ' ' + word : word;
          const estimatedWordSize = encodeURIComponent(testWord).length + 200;
          if (estimatedWordSize <= MAX_URL_LENGTH) {
            currentChunk = testWord;
          } else {
            if (currentChunk) {
              chunks.push(currentChunk);
            }
            currentChunk = word;
          }
        }
      }
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  return chunks;
}

async function translateText(text) {
  const sourceLang = fromLanguage === 'auto' ? 'auto' : fromLanguage;
  const targetLang = toLanguage;
  try {
    const chunks = splitTextForTranslation(text, sourceLang, targetLang);
    const translatedChunks = [];
    for (const chunk of chunks) {
      const body = {
        text: chunk,
        from: sourceLang,
        to: targetLang
      };
      const authHeaders = await AuthUtils.generateAuthHeaders('POST', PROXY_SERVER_PATH, body);
      const response = await fetch(PROXY_SERVER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Proxy server error: ${response.status} - ${errorData.error || 'Unknown error'}`);
      }
      const data = await response.json();
      if (data.success && data.translatedText) {
        translatedChunks.push(data.translatedText);
      } else {
        translatedChunks.push(chunk);
      }
    }
    return translatedChunks.join('');
  } catch (error) {
    console.error('[TranslateText] Error:', error);
    throw error;
  }
}

function showNotification(message, type = 'info') {
  if (!settings.showNotifications) return;
  const existing = document.getElementById('auto-translate-notification');
  if (existing) existing.remove();
  const notification = document.createElement('div');
  notification.id = 'auto-translate-notification';
  notification.textContent = message;
  const colors = {
    success: { bg: '#1e8e3e', text: '#fff' },
    error: { bg: '#d93025', text: '#fff' },
    info: { bg: '#1a73e8', text: '#fff' }
  };
  const color = colors[type] || colors.info;
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
  `;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
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
`;
document.head.appendChild(style);
