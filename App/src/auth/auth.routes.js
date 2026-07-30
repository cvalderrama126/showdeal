const router = require("express").Router();
const crypto = require("crypto");
const QRCode = require("qrcode");
const { z } = require("zod");
const rateLimit = require("express-rate-limit");
const { prisma } = require("../db/prisma");
const { requireAuth, jsonSafe } = require("./auth.middleware");
const { login, verifyOtp, otpSetup, otpEnable, otpDisable, changePassword, changePasswordForced } = require("./auth.service");
const { getModulePermissions } = require("../routes/access.guard");
const { audit } = require("../utils/audit.service");
const passwordResetRoutes = require("./password-reset.routes");

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const isProdEnv = process.env.NODE_ENV === "production";

// ✅ RATE LIMITING PARA AUTENTICACIÓN (Security: prevent brute force)
const authLimiter = rateLimit({
  windowMs: parsePositiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: parsePositiveInt(process.env.AUTH_RATE_LIMIT_MAX, isProdEnv ? 5 : 20),
  message: {
    ok: false,
    error: "Too many authentication attempts, try again later"
  },
  standardHeaders: true,
  skipSuccessfulRequests: true, // Don't count successful logins
});

// ✅ RATE LIMITING PARA OTP (Security: prevent brute force)
const otpLimiter = rateLimit({
  windowMs: parsePositiveInt(process.env.OTP_RATE_LIMIT_WINDOW_MS, 5 * 60 * 1000),
  max: parsePositiveInt(process.env.OTP_RATE_LIMIT_MAX, isProdEnv ? 3 : 30),
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

  // Only expose JWT in response body in non-production environments (local dev only)
  const exposeJwt = process.env.EXPOSE_JWT_IN_RESPONSE === "1"
    && process.env.NODE_ENV !== "production";

  if (!exposeJwt) {
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

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Current password required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

const passwordForcedSchema = z.object({
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

function handleZodError(err, res, next) {
  if (!(err instanceof z.ZodError)) return next(err);
  return res.status(400).json({
    ok: false,
    error: "VALIDATION_ERROR",
    issues: err.issues.map((issue) => ({ path: issue.path, message: issue.message })),
  });
}

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
    return handleZodError(err, res, next);
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
    return handleZodError(err, res, next);
  }
});

/**
 * Setup TOTP (genera secreto + otpauth_url) - requiere JWT (usuario logueado sin OTP o admin)
 * Si quieres forzar que SOLO admins activen TOTP, lo ajustamos luego.
 */
router.post("/otp/setup", requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const idUser = req.auth?.sub;
    const result = await otpSetup({ id_user: idUser, issuer: "ShowDeal" });
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
    const idUser = req.auth?.sub;
    // ✅ VALIDATE INPUT
    const validated = otpEnableSchema.parse(req.body);
    const result = await otpEnable({ id_user: idUser, otp: validated.otp });
    return respondWithResult(res, result);
  } catch (err) {
    return handleZodError(err, res, next);
  }
});

router.post("/otp/setup/:id_user", requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const idUser = req.params.id_user;
    if (!idUser || !/^\d+$/.test(String(idUser))) {
      return res.status(400).json({ ok: false, error: "INVALID_USER_ID" });
    }

    if (!canManageOtpForUser(req, idUser)) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    }

    const result = await otpSetup({ id_user: idUser, issuer: "ShowDeal" });
    return respondWithResult(res, result);
  } catch (err) {
    return next(err);
  }
});

router.get("/otp/qrcode", requireAuth, async (req, res, next) => {
  try {
    const requestedUserId = String(req.query.id_user || "").trim();
    const idUser = requestedUserId || req.auth?.sub;
    if (requestedUserId && !canManageOtpForUser(req, requestedUserId)) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    }
    let userId;
    try {
      userId = BigInt(String(idUser));
    } catch {
      return res.status(400).json({ ok: false, error: "INVALID_USER_ID" });
    }

    const user = await prisma.r_user.findUnique({
      where: { id_user: userId },
      select: { additional: true, is_active: true },
    });

    if (!user || user.is_active !== true) {
      return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
    }

    const otpauthUrl = user.additional?.otp?.otpauth_url;
    if (!otpauthUrl || typeof otpauthUrl !== "string") {
      return res.status(404).json({ ok: false, error: "OTP_SETUP_NOT_FOUND" });
    }

    const pngBuffer = await QRCode.toBuffer(otpauthUrl, {
      type: "png",
      width: 220,
      margin: 1,
      errorCorrectionLevel: "M",
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.send(pngBuffer);
  } catch (err) {
    return next(err);
  }
});

router.post("/otp/enable/:id_user", requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const idUser = req.params.id_user;
    if (!idUser || !/^\d+$/.test(String(idUser))) {
      return res.status(400).json({ ok: false, error: "INVALID_USER_ID" });
    }

    if (!canManageOtpForUser(req, idUser)) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    }

    const validated = otpEnableSchema.parse(req.body);
    const result = await otpEnable({ id_user: idUser, otp: validated.otp });
    if (result?.ok) {
      audit({ req, action: "OTP_ENABLE", entity: "r_user", entityId: idUser });
    }
    return respondWithResult(res, result);
  } catch (err) {
    return handleZodError(err, res, next);
  }
});

router.post("/otp/disable/:id_user", requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const idUser = req.params.id_user;
    if (!idUser || !/^\d+$/.test(String(idUser))) {
      return res.status(400).json({ ok: false, error: "INVALID_USER_ID" });
    }

    if (!canManageOtpForUser(req, idUser)) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    }

    const result = await otpDisable({ id_user: idUser });
    if (result?.ok) {
      audit({ req, action: "OTP_DISABLE", entity: "r_user", entityId: idUser });
    }
    return respondWithResult(res, result);
  } catch (err) {
    return next(err);
  }
});

router.post("/password/change", requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const idUser = req.auth?.sub;
    const validated = passwordChangeSchema.parse(req.body);
    const result = await changePassword({ 
      id_user: idUser,
      currentPassword: validated.currentPassword,
      newPassword: validated.newPassword
    });
    return respondWithResult(res, result);
  } catch (err) {
    return handleZodError(err, res, next);
  }
});

router.post("/password/change-forced/:id_user", requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const idUser = req.params.id_user;
    if (!idUser || !/^\d+$/.test(String(idUser))) {
      return res.status(400).json({ ok: false, error: "INVALID_USER_ID" });
    }

    // Solo admin puede forzar cambio de contraseña
    if (req.auth?.isAdmin !== true) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    }

    const validated = passwordForcedSchema.parse(req.body);
    const result = await changePasswordForced({ 
      id_user: idUser,
      newPassword: validated.newPassword
    });
    return respondWithResult(res, result);
  } catch (err) {
    return handleZodError(err, res, next);
  }
});

router.post("/password/setup-first-login", requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const idUser = req.auth?.sub;
    const validated = passwordForcedSchema.parse(req.body);
    const result = await changePasswordForced({ 
      id_user: idUser,
      newPassword: validated.newPassword
    });
    return respondWithResult(res, result);
  } catch (err) {
    return handleZodError(err, res, next);
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

    const roleName = String(req.auth?.roleName || "");
    const isBuyer = roleName.toLowerCase().includes("buyer");

    const data = await getModulePermissions({
      roleId: BigInt(String(roleId)),
      moduleNames: modules,
      isAdmin: req.auth?.isAdmin === true,
      roleName: req.auth?.roleName || "",
    });
    return res.json(jsonSafe({
      ok: true,
      isAdmin: req.auth?.isAdmin === true,
      isAuctioneer: req.auth?.isAuctioneer === true || String(roleName).toLowerCase().includes("auctioneer"),
      roleName,
      isBuyer,
      data,
    }));
  } catch (err) {
    return next(err);
  }
});

// ✅ PASSWORD RESET ROUTES
router.use("/password-reset", passwordResetRoutes);

module.exports = router;
