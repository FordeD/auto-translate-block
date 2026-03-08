const express = require("express");
const cors = require("cors");
const translate = require("@iamtraction/google-translate");
const crypto = require("crypto");

const app = express();
const PORT = 3000;

// Shared secret for HMAC authentication (should match extension)
const SHARED_SECRET = "auto-translate-block-secret-key-2024-secure-token";

// Token validity window in milliseconds (5 minutes)
const TOKEN_VALIDITY_MS = 5 * 60 * 1000;

// Store used tokens to prevent replay attacks
const usedTokens = new Set();

// Clean up old tokens every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const token of usedTokens) {
    const [, timestamp] = token.split(":");
    if (now - parseInt(timestamp) > TOKEN_VALIDITY_MS * 2) {
      usedTokens.delete(token);
    }
  }
}, 10 * 60 * 1000);

// Generate HMAC signature
function generateSignature(data, secret) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

// Verify HMAC signature
function verifySignature(data, signature, secret) {
  const expectedSignature = generateSignature(data, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expectedSignature, "hex")
  );
}

// Enable CORS
app.use(cors({
  origin: true,
  methods: ["POST", "OPTIONS", "GET"],
  allowedHeaders: ["Content-Type", "X-Signature", "X-Timestamp", "X-Nonce"]
}));

app.use(express.json());

// Middleware to validate HMAC signature
app.use((req, res, next) => {
  // Skip authentication for health check
  if (req.path === "/health") {
    return next();
  }
  
  const signature = req.headers["x-signature"];
  const timestamp = req.headers["x-timestamp"];
  const nonce = req.headers["x-nonce"];
  
  // Check required headers
  if (!signature || !timestamp || !nonce) {
    return res.status(401).json({ 
      success: false, 
      error: "Unauthorized: Missing authentication headers" 
    });
  }
  
  // Check timestamp validity
  const now = Date.now();
  const requestTime = parseInt(timestamp);
  const timeDiff = Math.abs(now - requestTime);
  
  if (timeDiff > TOKEN_VALIDITY_MS) {
    return res.status(401).json({ 
      success: false, 
      error: "Unauthorized: Token expired" 
    });
  }
  
  // Check for replay attack
  const tokenKey = `${signature}:${timestamp}`;
  if (usedTokens.has(tokenKey)) {
    return res.status(401).json({ 
      success: false, 
      error: "Unauthorized: Replay attack detected" 
    });
  }
  
  // Verify signature
  const bodyData = JSON.stringify(req.body);
  const dataToSign = `${req.method}:${req.path}:${timestamp}:${nonce}:${bodyData}`;
  
  if (!verifySignature(dataToSign, signature, SHARED_SECRET)) {
    return res.status(401).json({ 
      success: false, 
      error: "Unauthorized: Invalid signature" 
    });
  }
  
  // Mark token as used
  usedTokens.add(tokenKey);
  next();
});

// Translate endpoint
app.post("/translate", async (req, res) => {
  try {
    const { text, from, to } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }
    
    const sourceLang = from === "auto" ? "auto" : (from || "auto");
    const targetLang = to || "ru";
    
    const result = await translate(text, { from: sourceLang, to: targetLang });
    
    res.json({ 
      success: true, 
      translatedText: result.text,
      original: text
    });
    
  } catch (error) {
    console.error("[Proxy] Error:", error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", port: PORT });
});

app.listen(PORT, () => {
  console.log(`[Proxy] Server running on http://localhost:${PORT}`);
});
