// src/auth/auth.middleware.js
const jwt = require("jsonwebtoken");
const { getCookieValue, unsealToken } = require("./token-cookie");

function jsonSafe(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = jsonSafe(v);
    return out;
  }
  return value;
}

function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const cookieToken = unsealToken(getCookieValue(req, "sd_session_token"));
    const headerToken = header.startsWith("Bearer ") ? header.substring(7) : "";
    const token = String(headerToken || cookieToken || "").trim();
    if (!token) return res.status(401).json(jsonSafe({ ok: false, error: "Missing token" }));

    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json(jsonSafe({ ok: false, error: "JWT_SECRET missing" }));

    // ✅ ENHANCED JWT VALIDATION (Security: comprehensive token validation)
    const decoded = jwt.verify(token, secret, { 
      algorithms: ["HS256"],
      issuer: process.env.JWT_ISSUER, // Optional: validate issuer
      audience: process.env.JWT_AUDIENCE, // Optional: validate audience
      clockTolerance: 30, // Allow 30 seconds clock skew
    });

    // Validate token structure and required claims
    if (!decoded.sub) {
      return res.status(401).json(jsonSafe({ ok: false, error: "Invalid token structure: missing subject" }));
    }

    if (!decoded.iat) {
      return res.status(401).json(jsonSafe({ ok: false, error: "Invalid token structure: missing issued at" }));
    }

    // Check if token is expired (additional check beyond jwt.verify)
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      return res.status(401).json(jsonSafe({ ok: false, error: "Token expired" }));
    }

    // Validate issued at is not in the future
    if (decoded.iat > now + 60) { // Allow 1 minute clock skew
      return res.status(401).json(jsonSafe({ ok: false, error: "Token issued in the future" }));
    }

    req.auth = decoded;
    return next();
  } catch (e) {
    // Enhanced error handling for different JWT errors
    let errorMessage = "Invalid token";
    if (e.name === "TokenExpiredError") {
      errorMessage = "Token expired";
    } else if (e.name === "JsonWebTokenError") {
      errorMessage = "Invalid token format";
    } else if (e.name === "NotBeforeError") {
      errorMessage = "Token not active yet";
    }
    return res.status(401).json(jsonSafe({ ok: false, error: errorMessage }));
  }
}

module.exports = { requireAuth, jsonSafe };
