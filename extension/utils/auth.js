const AuthUtils = {
  async generateAuthHeaders(method, path, body) {
    const authData = await chrome.runtime.sendMessage({
      action: 'signRequest',
      method,
      path,
      body
    });
    
    return {
      "X-Signature": authData.signature,
      "X-Timestamp": authData.timestamp,
      "X-Nonce": authData.nonce
    };
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = AuthUtils;
}
