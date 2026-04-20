const router = require("express").Router();
const { z } = require("zod");
const rateLimit = require("express-rate-limit");
const csurf = require("csurf");
const { requireAuth, jsonSafe } = require("./auth.middleware");
const { login, verifyOtp, otpSetup, otpEnable, otpDisable, changePassword, changePasswordForced } = require("./auth.service");
const { getModulePermissions } = require("../routes/access.guard");
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


// ✅ CSRF PROTECTION (Security: prevent CSRF attacks)
// Only enable in production - in development, frontend needs token generation
const csrfProtection = process.env.NODE_ENV === 'production' 
  ? csurf({
      cookie: {
        httpOnly: true,
        secure: true,
        sameSite: 'strict'
      }
    })
  : (req, res, next) => next(); // Skip CSRF in development
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

router.post("/login", authLimiter, csrfProtection, async (req, res, next) => {
  try {
    // ✅ VALIDATE INPUT
    const validated = loginSchema.parse(req.body);
    const result = await login(validated);
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
    const result = await verifyOtp(validated);
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
      newPassword: z.string().min(8, "New password must be at least 8 characters"),
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
      newPassword: z.string().min(8, "New password must be at least 8 characters"),
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
      newPassword: z.string().min(8, "New password must be at least 8 characters"),
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
  return res.json({
    ok: true,
    csrfToken: req.csrfToken()
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
