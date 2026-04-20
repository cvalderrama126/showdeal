// src/utils/audit.service.js
//
// Centralized audit/traceability writer for the r_log table.
//
// Goals:
//   - Persist every business-relevant action (auth, OTP, CRUD, bids, bulk imports)
//     in r_log without breaking the caller if logging fails.
//   - Capture actor (id_user), context (ip, user agent), entity, action and a
//     compact JSON payload safe for forensic review (never includes secrets,
//     passwords or OTP secrets).
//
// Usage:
//   const { audit } = require("../utils/audit.service");
//   await audit({ req, action: "USER_CREATE", entity: "r_user",
//                 entityId: created.id_user, data: { name, role } });
//
// All writes are best-effort: errors are swallowed and logged to console
// so a failure of the audit pipeline never breaks the main request.

const { prisma } = require("../db/prisma");

const SENSITIVE_KEYS = new Set([
  "password",
  "current_password",
  "currentpassword",
  "new_password",
  "newpassword",
  "secret",
  "otp",
  "otp_secret",
  "challengetoken",
  "challenge_token",
  "token",
  "authorization",
  "authentication",
]);

function redact(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 5) return "[depth-limit]";

  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[buffer:${value.length}b]`;

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redact(item, depth + 1));
  }

  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(String(k).toLowerCase())) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }

  if (typeof value === "string" && value.length > 2000) {
    return `${value.slice(0, 2000)}…[truncated]`;
  }

  return value;
}

function actorFromReq(req) {
  if (!req || !req.auth) return null;
  return {
    id_user: req.auth.sub ? String(req.auth.sub) : null,
    login: req.auth.login || null,
    id_role: req.auth.roleId ? String(req.auth.roleId) : null,
    id_company: req.auth.companyId ? String(req.auth.companyId) : null,
    is_admin: req.auth.isAdmin === true,
  };
}

function contextFromReq(req) {
  if (!req) return {};
  // req.ip is trust-proxy aware when app.set("trust proxy", ...) is configured.
  const ip = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || null;
  const ua = req.headers ? req.headers["user-agent"] || null : null;
  return {
    ip: ip || null,
    user_agent: ua ? String(ua).slice(0, 300) : null,
    method: req.method || null,
    path: req.originalUrl || req.url || null,
  };
}

/**
 * Persist a single audit event.
 *
 * @param {Object} params
 * @param {Object} [params.req]    Express request (used to extract actor/context).
 * @param {string} params.action   Short code, e.g. "LOGIN_SUCCESS", "USER_CREATE".
 * @param {string} [params.entity] Affected entity name, e.g. "r_user".
 * @param {string|number|bigint} [params.entityId]
 * @param {Object} [params.data]   Extra payload (will be redacted).
 * @param {string} [params.tp_log] Override log type. Defaults to action.
 * @param {string} [params.actorOverride] Explicit actor id (e.g. login attempts).
 */
async function audit({
  req,
  action,
  entity = null,
  entityId = null,
  data = null,
  tp_log = null,
  actorOverride = null,
} = {}) {
  try {
    if (!action) return;

    const payload = {
      action: String(action),
      entity: entity ? String(entity) : null,
      entity_id: entityId !== null && entityId !== undefined ? String(entityId) : null,
      actor: actorOverride
        ? { id_user: String(actorOverride) }
        : actorFromReq(req),
      context: contextFromReq(req),
      data: data ? redact(data) : null,
      at: new Date().toISOString(),
    };

    await prisma.r_log.create({
      data: {
        tp_log: String(tp_log || action).slice(0, 64),
        log: payload,
      },
    });
  } catch (err) {
    // Never break the caller because of audit failures.
    // eslint-disable-next-line no-console
    console.error("[audit] failed to persist log:", err?.message || err);
  }
}

module.exports = { audit, redact };
