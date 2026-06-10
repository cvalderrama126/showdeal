const router = require("express").Router();
const crypto = require("crypto");
const { z } = require("zod");
const rateLimit = require("express-rate-limit");
const { requireAuth, jsonSafe } = require("./auth.middleware");
const { login, verifyOtp, otpSetup, otpEnable, otpDisable, changePassword, changePasswordForced } = require("./auth.service");
const { getModulePermissions } = require("../routes/access.guard");
const { audit } = require("../utils/audit.service");
const passwordResetRoutes = require("./password-reset.routes");

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

const AUTH_COOKIE_NAME = "sd_auth";
const CSRF_COOKIE_NAME = "sd_csrf";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 60 * 60 * 1000,
  };
}

function csrfCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "strict",
    path: "/",
    maxAge: 2 * 60 * 60 * 1000,
  };
}

function maybeSetSessionCookie(res, result) {
  if (!result?.ok || !result?.data?.token) return result;

  const token = String(result.data.token);
  res.cookie(AUTH_COOKIE_NAME, token, sessionCookieOptions());

  if (process.env.EXPOSE_JWT_IN_RESPONSE !== "1") {
    delete result.data.token;
  }

  return result;
}

function requiresCsrfValidation(req) {
  const method = String(req.method || "").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return false;

  const routePath = String(req.path || "");
  if (routePath === "/login") return false;
  if (routePath === "/otp/verify") return false;
  if (routePath.startsWith("/password-reset/")) return false;
  if (routePath === "/logout") return false;

  return true;
}

function csrfProtection(req, res, next) {
  if (process.env.NODE_ENV === "test") return next();
  if (!requiresCsrfValidation(req)) return next();

  const csrfCookie = req.cookies?.[CSRF_COOKIE_NAME];
  const csrfHeader = req.get("x-csrf-token");

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return res.status(403).json({
      ok: false,
      error: "CSRF_TOKEN_INVALID",
    });
  }

  return next();
}


// ✅ CSRF PROTECTION (Security: prevent CSRF attacks)
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

function respondWithResult(res, result) {
  return res.status(result.status).json(
    jsonSafe(
      result.ok
        ? { ok: true, ...result.data }
        : {
            ok: false,
            error: result.error,
            code: result.code,
            requireChange: result.requireChange,
            user: result.user,
          }
    )
  );
}

router.use(csrfProtection);

router.post("/login", authLimiter, csrfProtection, async (req, res, next) => {
  try {
    // ✅ VALIDATE INPUT
    const validated = loginSchema.parse(req.body);
    const result = maybeSetSessionCookie(res, await login(validated));

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

    return respondWithResult(res, result);
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

router.post("/otp/verify", otpLimiter, csrfProtection, async (req, res, next) => {
  try {
    // ✅ VALIDATE INPUT
    const validated = otpVerifySchema.parse(req.body);
    const result = maybeSetSessionCookie(res, await verifyOtp(validated));

    audit({
      req,
      action: result?.ok ? "OTP_VERIFY_SUCCESS" : "OTP_VERIFY_FAILURE",
      entity: "r_user",
      entityId: result?.data?.user?.id_user,
      data: { reason: result?.ok ? null : result?.error },
    });

    return respondWithResult(res, result);
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
router.post("/otp/setup", requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const id_user = req.auth?.sub;
    const result = await otpSetup({ id_user, issuer: "ShowDeal" });
    return respondWithResult(res, result);
  } catch (err) {
    return next(err);
  }
});

/**
 * Enable TOTP (valida un OTP y habilita)
 */
router.post("/otp/enable", requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const id_user = req.auth?.sub;
    // ✅ VALIDATE INPUT
    const validated = otpEnableSchema.parse(req.body);
    const result = await otpEnable({ id_user, otp: validated.otp });
    return respondWithResult(res, result);
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

router.post("/otp/setup/:id_user", requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const id_user = req.params?.id_user;
    if (!id_user || !/^\d+$/.test(String(id_user))) {
      return res.status(400).json({ ok: false, error: "INVALID_USER_ID" });
    }

    if (!canManageOtpForUser(req, id_user)) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    }

    const result = await otpSetup({ id_user, issuer: "ShowDeal" });
    return respondWithResult(res, result);
  } catch (err) {
    return next(err);
  }
});

router.post("/otp/enable/:id_user", requireAuth, csrfProtection, async (req, res, next) => {
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
    return respondWithResult(res, result);
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

router.post("/otp/disable/:id_user", requireAuth, csrfProtection, async (req, res, next) => {
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
    return respondWithResult(res, result);
  } catch (err) {
    return next(err);
  }
});

router.post("/password/change", requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const id_user = req.auth?.sub;
    const schema = z.object({
      currentPassword: z.string().min(1, "Current password required"),
      newPassword: z.string()
        .min(8, "New password must be at least 8 characters")
        .max(128, "New password must be at most 128 characters long")
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
          "New password must contain at least one lowercase letter, one uppercase letter, and one number"),
    });
    
    const validated = schema.parse(req.body);
    const result = await changePassword({ 
      id_user,
      currentPassword: validated.currentPassword,
      newPassword: validated.newPassword
    });
    return respondWithResult(res, result);
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

router.post("/password/change-forced/:id_user", requireAuth, csrfProtection, async (req, res, next) => {
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
      newPassword: z.string()
        .min(8, "New password must be at least 8 characters")
        .max(128, "New password must be at most 128 characters long")
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
          "New password must contain at least one lowercase letter, one uppercase letter, and one number"),
    });
    
    const validated = schema.parse(req.body);
    const result = await changePasswordForced({ 
      id_user,
      newPassword: validated.newPassword
    });
    return respondWithResult(res, result);
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

router.post("/password/setup-first-login", requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const id_user = req.auth?.sub;
    
    const schema = z.object({
      newPassword: z.string()
        .min(8, "New password must be at least 8 characters")
        .max(128, "New password must be at most 128 characters long")
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
          "New password must contain at least one lowercase letter, one uppercase letter, and one number"),
    });
    
    const validated = schema.parse(req.body);
    const result = await changePasswordForced({ 
      id_user,
      newPassword: validated.newPassword
    });
    return respondWithResult(res, result);
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

router.get("/csrf-token", csrfProtection, (req, res) => {
  const csrfToken = crypto.randomBytes(32).toString("hex");
  res.cookie(CSRF_COOKIE_NAME, csrfToken, csrfCookieOptions());

  return res.json({
    ok: true,
    csrfToken,
  });
});

router.post("/logout", (req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
  res.clearCookie(CSRF_COOKIE_NAME, { path: "/" });
  return res.json({ ok: true });
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
