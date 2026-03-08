/**
 * Translation Utility Module
 * Provides translation services for the Auto Translate Block extension
 * 
 * Main translation: Google Translate via http://translate.google.ru/translate_a/t
 */

// Browser-specific URL length limits (in characters)
// Based on Chromium engine limits for each browser
const BROWSER_URL_LIMITS = {
  chrome: 2097152,           // Chrome: 2MB
  opera: 2097152,            // Opera: 2MB (Chromium-based)
  operaGX: 2097152,          // Opera GX: 2MB (Chromium-based)
  yandex: 2097152,           // Yandex Browser: 2MB (Chromium-based)
  edge: 2097152,             // Edge: 2MB (Chromium-based)
  brave: 2097152,            // Brave: 2MB (Chromium-based)
  default: 2097152           // Default fallback: 2MB
};

// Safe margin to stay well under the limit (accounting for headers, encoding, etc.)
const URL_SAFE_MARGIN = 10000;

// Detected browser and its URL limit
let detectedBrowser = 'default';
let maxUrlLength = BROWSER_URL_LIMITS.default - URL_SAFE_MARGIN;

// Detect browser and set appropriate URL limit
function detectBrowser() {
  if (typeof navigator === 'undefined') return; // Node.js environment
  
  const userAgent = navigator.userAgent.toLowerCase();
  
  if (userAgent.includes('edg/')) {
    detectedBrowser = 'edge';
  } else if (userAgent.includes('yandex')) {
    detectedBrowser = 'yandex';
  } else if (userAgent.includes('opr') || userAgent.includes('opera')) {
    // Opera GX also uses 'OPR' in user agent
    if (userAgent.includes('ogx')) {
      detectedBrowser = 'operaGX';
    } else {
      detectedBrowser = 'opera';
    }
  } else if (userAgent.includes('brave')) {
    detectedBrowser = 'brave';
  } else if (userAgent.includes('chrome')) {
    detectedBrowser = 'chrome';
  }
  
  // Set the max URL length for detected browser with safety margin
  maxUrlLength = (BROWSER_URL_LIMITS[detectedBrowser] || BROWSER_URL_LIMITS.default) - URL_SAFE_MARGIN;
  
  console.log(`[Translator Utils] Detected browser: ${detectedBrowser}, Max URL length: ${maxUrlLength}`);
}

// Run browser detection immediately
detectBrowser();

const TranslationService = {
  // Maximum URL length to avoid HTTP request limits (browser-specific)
  get MAX_URL_LENGTH() {
    return maxUrlLength;
  },
  
  // Get detected browser name
  get detectedBrowser() {
    return detectedBrowser;
  },

  /**
   * Translate text using Google Translate URL
   * @param {string} text - Text to translate
   * @param {string} fromLang - Source language code
   * @param {string} toLang - Target language code
   * @returns {Promise<string>} Translated text
   */
  async translate(text, fromLang, toLang) {
    return this.translateWithGoogle(text, fromLang, toLang);
  },

  /**
   * Split text into chunks that fit within URL length limits
   * Splits at sentence boundaries or word spaces when possible
   */
  splitTextForTranslation(text, fromLang, toLang) {
    const baseUrl = 'http://translate.google.ru/translate_a/t?client=x&text=';
    const baseParams = `&hl=en&sl=${fromLang}&tl=${toLang}`;
    const baseLength = baseUrl.length + baseParams.length;
    
    const chunks = [];
    let currentChunk = '';
    
    // Use browser-specific max URL length
    const limit = this.MAX_URL_LENGTH;
    
    // Split by sentences first (., !, ?, ., !, ?)
    const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];
    
    for (const sentence of sentences) {
      const testChunk = currentChunk ? currentChunk + sentence : sentence;
      const encodedLength = encodeURIComponent(testChunk).length;
      
      if (baseLength + encodedLength <= limit) {
        // Fits in current chunk
        currentChunk = testChunk;
      } else {
        // Doesn't fit - save current chunk if not empty
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        
        // Check if single sentence fits alone
        if (baseLength + encodeURIComponent(sentence).length <= limit) {
          currentChunk = sentence;
        } else {
          // Sentence too long - split by words
          const words = sentence.split(/\s+/);
          currentChunk = '';
          
          for (const word of words) {
            const testWord = currentChunk ? currentChunk + ' ' + word : word;
            const encodedWordLength = encodeURIComponent(testWord).length;
            
            if (baseLength + encodedWordLength <= limit) {
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
    
    // Add remaining chunk
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  },

  /**
   * Translate using Google Translate via http://translate.google.ru
   * Extracts translation from response.sentences[0].trans
   */
  async translateWithGoogle(text, fromLang, toLang) {
    // Split text into chunks if needed
    const chunks = this.splitTextForTranslation(text, fromLang, toLang);
    const translatedChunks = [];
    
    for (const chunk of chunks) {
      const url = `http://translate.google.ru/translate_a/t?client=x&text=${encodeURIComponent(chunk)}&hl=en&sl=${fromLang}&tl=${toLang}`;
      
      try {
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`Google Translate API error: ${response.status}`);
        }

        const data = await response.json();
        
        // Extract translation from response path: sentences[0].trans
        // Google Translate API returns: { sentences: [{ trans: "..." }] }
        if (data.sentences && data.sentences[0] && data.sentences[0].trans) {
          translatedChunks.push(data.sentences[0].trans);
        } else if (data[0] && Array.isArray(data[0])) {
          // Alternative format: [[["translation", "original", ...]], ...]
          const translation = data[0]
            .filter(item => item && item[0])
            .map(item => item[0])
            .join('');
          if (translation) {
            translatedChunks.push(translation);
          } else {
            translatedChunks.push(chunk);
          }
        } else {
          // Fallback: return original if no translation found
          translatedChunks.push(chunk);
          console.warn('[Translator Utils] No translation found in response:', data);
        }
      } catch (error) {
        console.error('[Translator Utils] Google Translate error for chunk:', chunk, error);
        throw error;
      }
    }
    
    return translatedChunks.join('');
  },

  /**
   * Batch translate multiple texts
   */
  async batchTranslate(texts, fromLang, toLang) {
    const results = [];

    for (const text of texts) {
      try {
        const translated = await this.translate(text, fromLang, toLang);
        results.push({ original: text, translated });
      } catch (error) {
        results.push({ original: text, translated: text, error: error.message });
      }
    }

    return results;
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TranslationService;
}
