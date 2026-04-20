const router = require("express").Router();
const { z } = require("zod");
const rateLimit = require("express-rate-limit");
const { requireAuth, jsonSafe } = require("./auth.middleware");
const { login, verifyOtp, otpSetup, otpEnable, otpDisable, changePassword, changePasswordForced } = require("./auth.service");
const { getModulePermissions } = require("../routes/access.guard");
const { audit } = require("../utils/audit.service");
const passwordResetRoutes = require("./password-reset.routes");
const { sealToken } = require("./token-cookie");

// ✅ RATE LIMITING PARA AUTENTICACIÓN (Security: prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    ok: false,
    error: "Too many authentication attempts, try again later"
  },
  standardHeaders: true,
  skipSuccessfulRequests: true, // Don't count successful logins
});

// ✅ RATE LIMITING PARA OTP (Security: prevent brute force)
const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // 3 attempts per window
  message: {
    ok: false,
    error: "Too many OTP attempts, try again later"
  },
  standardHeaders: true,
  skipSuccessfulRequests: true,
});


const TOKEN_COOKIE_NAME = "sd_session_token";
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isSecureRequest(req) {
  if (req.secure) return true;
  return String(req.headers["x-forwarded-proto"] || "").toLowerCase() === "https";
}

function authCookieOptions(req) {
  const secure = isSecureRequest(req);
  return {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 60 * 60 * 1000,
  };
}

function setAuthCookie(req, res, token) {
  if (!token) return;
  const sealedToken = sealToken(token);
  res.cookie(TOKEN_COOKIE_NAME, sealedToken, authCookieOptions(req));
}

function clearAuthCookie(req, res) {
  res.clearCookie(TOKEN_COOKIE_NAME, authCookieOptions(req));
}

function extractOriginHost(value) {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function isSameOriginRequest(req) {
  const originHost = extractOriginHost(req.headers.origin);
  const refererHost = extractOriginHost(req.headers.referer);
  const expectedHost = req.get("host");
  if (!expectedHost) return false;
  if (originHost) return originHost === expectedHost;
  if (refererHost) return refererHost === expectedHost;
  return false;
}

function requireSameOriginForStateChange(req, res, next) {
  if (!STATE_CHANGING_METHODS.has(req.method)) return next();
  if (isSameOriginRequest(req)) return next();
  return res.status(403).json({ ok: false, error: "CSRF_ORIGIN_REJECTED" });
}
// ✅ INPUT VALIDATION SCHEMAS
const loginSchema = z.object({
  user: z.string().trim().min(1, "Username required").max(100, "Username too long"),
  password: z.string().min(1, "Password required").max(500, "Password too long"),
});

const otpVerifySchema = z.object({
  challengeToken: z.string().min(1, "Challenge token required"),
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
});

const otpEnableSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
});

function canManageOtpForUser(req, targetUserId) {
  if (req.auth?.isAdmin === true) return true;
  return String(req.auth?.sub || "") === String(targetUserId || "");
}

function respondWithResult(req, res, result) {
  const payload = result.ok
    ? { ok: true, ...(result.data || {}) }
    : {
        ok: false,
        error: result.error,
        code: result.code,
        requireChange: result.requireChange,
        user: result.user,
      };

  if (result?.ok && payload.token) {
    setAuthCookie(req, res, payload.token);
    delete payload.token;
  }

  return res.status(result.status).json(
    jsonSafe(payload)
  );
}

router.post("/login", authLimiter, requireSameOriginForStateChange, async (req, res, next) => {
  try {
    // ✅ VALIDATE INPUT
    const validated = loginSchema.parse(req.body);
    const result = await login(validated);

    // Audit: capture login attempt outcome (success / failure / OTP required)
    if (result?.ok && result?.data?.requireOtp) {
      audit({
        req,
        action: "LOGIN_OTP_CHALLENGE",
        entity: "r_user",
        entityId: result.data.user?.id_user,
        data: { user: validated.user },
      });
    } else if (result?.ok) {
      audit({
        req,
        action: "LOGIN_SUCCESS",
        entity: "r_user",
        entityId: result.data?.user?.id_user,
        data: { user: validated.user, firstLogin: result.data?.firstLogin === true },
      });
    } else {
      audit({
        req,
        action: "LOGIN_FAILURE",
        entity: "r_user",
        data: { user: validated.user, reason: result?.error, code: result?.code },
      });
    }

    return respondWithResult(req, res, result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        issues: err.issues.map(i => ({ path: i.path, message: i.message })),
      });
    }
    return next(err);
  }
});

router.post("/otp/verify", otpLimiter, requireSameOriginForStateChange, async (req, res, next) => {
  try {
    // ✅ VALIDATE INPUT
    const validated = otpVerifySchema.parse(req.body);
    const result = await verifyOtp(validated);

    audit({
      req,
      action: result?.ok ? "OTP_VERIFY_SUCCESS" : "OTP_VERIFY_FAILURE",
      entity: "r_user",
      entityId: result?.data?.user?.id_user,
      data: { reason: result?.ok ? null : result?.error },
    });

    return respondWithResult(req, res, result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        issues: err.issues.map(i => ({ path: i.path, message: i.message })),
      });
    }
    return next(err);
  }
});

/**
 * Setup TOTP (genera secreto + otpauth_url) - requiere JWT (usuario logueado sin OTP o admin)
 * Si quieres forzar que SOLO admins activen TOTP, lo ajustamos luego.
 */
router.post("/otp/setup", requireAuth, requireSameOriginForStateChange, async (req, res, next) => {
  try {
    const id_user = req.auth?.sub;
    const result = await otpSetup({ id_user, issuer: "ShowDeal" });
    return respondWithResult(req, res, result);
  } catch (err) {
    return next(err);
  }
});

/**
 * Enable TOTP (valida un OTP y habilita)
 */
router.post("/otp/enable", requireAuth, requireSameOriginForStateChange, async (req, res, next) => {
  try {
    const id_user = req.auth?.sub;
    // ✅ VALIDATE INPUT
    const validated = otpEnableSchema.parse(req.body);
    const result = await otpEnable({ id_user, otp: validated.otp });
    return respondWithResult(req, res, result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        issues: err.issues.map(i => ({ path: i.path, message: i.message })),
      });
    }
    return next(err);
  }
});

router.post("/otp/setup/:id_user", requireAuth, requireSameOriginForStateChange, async (req, res, next) => {
  try {
    const id_user = req.params?.id_user;
    if (!id_user || !/^\d+$/.test(String(id_user))) {
      return res.status(400).json({ ok: false, error: "INVALID_USER_ID" });
    }

    if (!canManageOtpForUser(req, id_user)) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    }

    const result = await otpSetup({ id_user, issuer: "ShowDeal" });
    return respondWithResult(req, res, result);
  } catch (err) {
    return next(err);
  }
});

router.post("/otp/enable/:id_user", requireAuth, requireSameOriginForStateChange, async (req, res, next) => {
  try {
    const id_user = req.params?.id_user;
    if (!id_user || !/^\d+$/.test(String(id_user))) {
      return res.status(400).json({ ok: false, error: "INVALID_USER_ID" });
    }

    if (!canManageOtpForUser(req, id_user)) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    }

    const validated = otpEnableSchema.parse(req.body);
    const result = await otpEnable({ id_user, otp: validated.otp });
    if (result?.ok) {
      audit({ req, action: "OTP_ENABLE", entity: "r_user", entityId: id_user });
    }
    return respondWithResult(req, res, result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        issues: err.issues.map(i => ({ path: i.path, message: i.message })),
      });
    }
    return next(err);
  }
});

router.post("/otp/disable/:id_user", requireAuth, requireSameOriginForStateChange, async (req, res, next) => {
  try {
    const id_user = req.params?.id_user;
    if (!id_user || !/^\d+$/.test(String(id_user))) {
      return res.status(400).json({ ok: false, error: "INVALID_USER_ID" });
    }

    if (!canManageOtpForUser(req, id_user)) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    }

    const result = await otpDisable({ id_user });
    if (result?.ok) {
      audit({ req, action: "OTP_DISABLE", entity: "r_user", entityId: id_user });
    }
    return respondWithResult(req, res, result);
  } catch (err) {
    return next(err);
  }
});

router.post("/password/change", requireAuth, requireSameOriginForStateChange, async (req, res, next) => {
  try {
    const id_user = req.auth?.sub;
    const schema = z.object({
      currentPassword: z.string().min(1, "Current password required"),
      newPassword: z.string().min(8, "New password must be at least 8 characters"),
    });
    
    const validated = schema.parse(req.body);
    const result = await changePassword({ 
      id_user,
      currentPassword: validated.currentPassword,
      newPassword: validated.newPassword
    });
    return respondWithResult(req, res, result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        issues: err.issues.map(i => ({ path: i.path, message: i.message })),
      });
    }
    return next(err);
  }
});

router.post("/password/change-forced/:id_user", requireAuth, requireSameOriginForStateChange, async (req, res, next) => {
  try {
    const id_user = req.params?.id_user;
    if (!id_user || !/^\d+$/.test(String(id_user))) {
      return res.status(400).json({ ok: false, error: "INVALID_USER_ID" });
    }

    // Solo admin puede forzar cambio de contraseña
    if (req.auth?.isAdmin !== true) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    }

    const schema = z.object({
      newPassword: z.string().min(8, "New password must be at least 8 characters"),
    });
    
    const validated = schema.parse(req.body);
    const result = await changePasswordForced({ 
      id_user,
      newPassword: validated.newPassword
    });
    return respondWithResult(req, res, result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        issues: err.issues.map(i => ({ path: i.path, message: i.message })),
      });
    }
    return next(err);
  }
});

router.post("/password/setup-first-login", requireAuth, requireSameOriginForStateChange, async (req, res, next) => {
  try {
    const id_user = req.auth?.sub;
    
    const schema = z.object({
      newPassword: z.string().min(8, "New password must be at least 8 characters"),
    });
    
    const validated = schema.parse(req.body);
    const result = await changePasswordForced({ 
      id_user,
      newPassword: validated.newPassword
    });
    return respondWithResult(req, res, result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        issues: err.issues.map(i => ({ path: i.path, message: i.message })),
      });
    }
    return next(err);
  }
});

router.post("/logout", requireSameOriginForStateChange, (req, res) => {
  clearAuthCookie(req, res);
  return res.json({ ok: true });
});

router.get("/csrf-token", (req, res) => {
  return res.json({
    ok: true,
    csrfToken: null,
    strategy: "same-origin"
  });
});

router.get("/me", requireAuth, async (req, res) => {
  return res.json(jsonSafe({ ok: true, auth: req.auth }));
});

router.get("/permissions", requireAuth, async (req, res, next) => {
  try {
    const roleId = req.auth?.roleId;
    if (!roleId || !/^\d+$/.test(String(roleId))) {
      return res.status(400).json({ ok: false, error: "INVALID_ROLE_IN_TOKEN" });
    }

    const modules = String(req.query.modules || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const data = await getModulePermissions({
      roleId: BigInt(String(roleId)),
      moduleNames: modules,
      isAdmin: req.auth?.isAdmin === true,
    });
    return res.json(jsonSafe({ ok: true, isAdmin: req.auth?.isAdmin === true, data }));
  } catch (err) {
    return next(err);
  }
});

// ✅ PASSWORD RESET ROUTES
router.use("/password-reset", passwordResetRoutes);

module.exports = router;
