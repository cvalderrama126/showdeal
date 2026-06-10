// src/auth/auth.middleware.js
const jwt = require("jsonwebtoken");
const { jsonSafe } = require("../routes/jsonSafe");
const { prisma } = require("../db/prisma");

function parseTokenVersion(value) {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const bearerToken = header.startsWith("Bearer ") ? header.substring(7) : "";
    const cookieToken = req.cookies?.sd_auth ? String(req.cookies.sd_auth) : "";
    const token = bearerToken || cookieToken;

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

    let userId;
    try {
      userId = BigInt(String(decoded.sub));
    } catch {
      return res.status(401).json(jsonSafe({ ok: false, error: "Invalid token subject" }));
    }

    const userRow = await prisma.r_user.findUnique({
      where: { id_user: userId },
      select: { additional: true, is_active: true },
    });

    if (!userRow || userRow.is_active !== true) {
      return res.status(401).json(jsonSafe({ ok: false, error: "User not active" }));
    }

    const userTokenVersion = parseTokenVersion(userRow.additional?.token_version);
    const tokenVersion = parseTokenVersion(decoded.tokenVersion);

    if (tokenVersion !== userTokenVersion) {
      return res.status(401).json(jsonSafe({ ok: false, error: "Token revoked" }));
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
