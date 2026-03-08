// Background service worker for Auto Translate Block extension

const SHARED_SECRET = "auto-translate-block-secret-key-2024-secure-token";

async function generateSignature(data, secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const dataData = encoder.encode(data);
  
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    dataData
  );
  
  return Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      fromLanguage: 'auto',
      toLanguage: 'ru',
      uiLanguage: 'en',
      highlightColor: '#00bfff',
      highlightOpacity: '0.3',
      preserveFormatting: false,
      translateAttributes: true,
      showNotifications: true
    });
    
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'signRequest') {
    if (!sender.id || sender.id !== chrome.runtime.id) {
      sendResponse({ error: 'Unauthorized' });
      return false;
    }
    
    const timestamp = Date.now().toString();
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    
    const bodyData = JSON.stringify(message.body);
    const dataToSign = `${message.method}:${message.path}:${timestamp}:${nonce}:${bodyData}`;
    
    generateSignature(dataToSign, SHARED_SECRET).then(signature => {
      sendResponse({
        signature,
        timestamp,
        nonce
      });
    });
    
    return true;
  }
  
  if (message.action === 'getActiveTab') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tab: tabs[0] });
    });
    return true;
  }
  
  if (message.action === 'getExtensionToken') {
    sendResponse({ token: 'authenticated-via-background' });
    return true;
  }
});
