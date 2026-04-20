const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { authenticator } = require("otplib");
const { prisma } = require("../db/prisma");
const { isSha256Hash, bcryptHash } = require("./password-migration.service");

function toJwtSafe(value) {
  if (typeof value === "bigint") return value.toString();
  return value;
}

function getJwtConfig() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is missing in .env");

  // ✅ JWT SECRET HARDENING (Security: prevent weak secrets)
  validateJwtSecret(secret, "JWT_SECRET");

  return { secret, expiresIn: process.env.JWT_EXPIRES_IN || "8h" };
}

function getChallengeConfig() {
  const secret = process.env.JWT_CHALLENGE_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_CHALLENGE_SECRET (or JWT_SECRET) missing in .env");

  // ✅ JWT SECRET HARDENING (Security: prevent weak secrets)
  validateJwtSecret(secret, "JWT_CHALLENGE_SECRET");

  return { secret, expiresIn: process.env.JWT_CHALLENGE_EXPIRES_IN || "5m" };
}

// ✅ JWT SECRET VALIDATION (Security: enforce strong secrets)
function validateJwtSecret(secret, envVarName) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error(`${envVarName} must be at least 32 characters long`);
  }

  // Check for common weak patterns
  const weakPatterns = [
    /^password/i,
    /^secret/i,
    /^token/i,
    /^key/i,
    /^123456/,
    /^abcdef/i,
    /password$/i,
    /secret$/i,
  ];

  for (const pattern of weakPatterns) {
    if (pattern.test(secret)) {
      throw new Error(`${envVarName} contains weak patterns. Use a cryptographically secure random string`);
    }
  }

  // Check entropy (basic check for repeated characters)
  const uniqueChars = new Set(secret).size;
  const entropyRatio = uniqueChars / secret.length;
  if (entropyRatio < 0.7) {
    throw new Error(`${envVarName} has low entropy. Use a cryptographically secure random string`);
  }

  // Additional validation: should contain mix of character types
  const hasLower = /[a-z]/.test(secret);
  const hasUpper = /[A-Z]/.test(secret);
  const hasDigit = /\d/.test(secret);
  const hasSpecial = /[^a-zA-Z\d]/.test(secret);

  const charTypeCount = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;
  if (charTypeCount < 3) {
    throw new Error(`${envVarName} should contain a mix of lowercase, uppercase, digits, and special characters`);
  }
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function parseYmdDate(s) {
  if (!s || typeof s !== "string") return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function todayUtcYmd() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return new Date(`${y}-${m}-${d}T00:00:00.000Z`);
}

function getLatestCredential(authentication) {
  const arr = Array.isArray(authentication) ? authentication : [];
  if (arr.length === 0) return null;

  let best = null;
  let bestCreated = null;

  for (const item of arr) {
    const created = parseYmdDate(item?.created);
    if (!created) continue;

    if (!bestCreated || created.getTime() > bestCreated.getTime()) {
      bestCreated = created;
      best = item;
    }
  }

  if (!best) {
    const last = arr[arr.length - 1];
    return last && typeof last === "object" ? last : null;
  }

  return best;
}

function otpInfo(additional) {
  const otp = additional?.otp;
  const secret = typeof otp?.secret === "string" ? otp.secret : null;
  const enabled = otp?.enabled === true;  // SOLO si está explícitamente habilitado
  const issuer = typeof otp?.issuer === "string" ? otp.issuer : "ShowDeal";
  const label = typeof otp?.label === "string" ? otp.label : null;
  return { enabled, secret, issuer, label };
}

function normalizeUserRecord(row) {
  if (!row) return null;

  const login = row.user || row.user_1 || row.login || null;
  const roleName = row.r_role?.role || row.role || null;
  const roleAdditional = row.r_role?.additional || row.role_additional || null;
  const isAdmin =
    roleAdditional?.is_admin === true ||
    roleAdditional?.admin === true ||
    /^(root|admin|administrator|superadmin)$/i.test(String(roleName || "").trim());

  return {
    ...row,
    login,
    roleName,
    isAdmin,
  };
}

function buildUserPayload(row) {
  const user = normalizeUserRecord(row);
  if (!user) return null;

  return {
    id_user: user.id_user,
    user: user.login,
    name: user.name,
    id_company: user.id_company,
    id_role: user.id_role,
    isAdmin: user.isAdmin || false,
  };
}

async function findUserByLogin(user) {
  const row = await prisma.r_user.findFirst({
    where: {
      user_1: user,
    },
    include: {
      r_role: {
        select: {
          role: true,
          additional: true,
        },
      },
    },
  });

  return normalizeUserRecord(row);
}

async function findUserById(id_user) {
  const row = await prisma.r_user.findUnique({
    where: {
      id_user: BigInt(String(id_user)),
    },
    include: {
      r_role: {
        select: {
          role: true,
          additional: true,
        },
      },
    },
  });

  return normalizeUserRecord(row);
}

function signJwt(payload) {
  const { secret, expiresIn } = getJwtConfig();
  return jwt.sign(payload, secret, { expiresIn });
}

function signChallenge(payload) {
  const { secret, expiresIn } = getChallengeConfig();
  return jwt.sign(payload, secret, { expiresIn });
}

function verifyChallenge(token) {
  const { secret } = getChallengeConfig();
  return jwt.verify(token, secret);
}

async function verifyPassword(plainPassword, storedPassword) {
  const stored = String(storedPassword || "");
  if (!stored) return false;

  if (/^\$2[aby]\$\d{2}\$/.test(stored)) {
    return bcrypt.compare(String(plainPassword || ""), stored);
  }

  const inputHash = sha256Hex(plainPassword);
  return inputHash === stored.toLowerCase();
}

/**
 * Verify password with automatic migration from SHA256 to bcrypt
 * @param {string} plainPassword - Plain text password
 * @param {string} storedPassword - Stored password hash
 * @param {bigint} userId - User ID for migration
 * @returns {Promise<boolean>} True if password is valid
 */
async function verifyPasswordWithMigration(plainPassword, storedPassword, userId) {
  const stored = String(storedPassword || "");
  if (!stored) return false;

  // If already bcrypt, just verify
  if (/^\$2[aby]\$\d{2}\$/.test(stored)) {
    return bcrypt.compare(String(plainPassword || ""), stored);
  }

  // If SHA256, verify and migrate
  if (isSha256Hash(stored)) {
    const inputHash = sha256Hex(plainPassword);
    const isValid = inputHash === stored.toLowerCase();

    if (isValid && userId) {
      // Migrate password to bcrypt in background
      try {
        const newHash = await bcryptHash(plainPassword);

        // Update user password in database
        const user = await prisma.r_user.findUnique({
          where: { id_user: userId },
          select: { authentication: true }
        });

        if (user && user.authentication && Array.isArray(user.authentication)) {
          const updatedCredentials = user.authentication.map(cred => {
            if (cred && typeof cred === 'object' && cred.password === stored) {
              return {
                ...cred,
                password: newHash,
                migrated_from_sha256: true,
                migrated_at: new Date().toISOString()
              };
            }
            return cred;
          });

          await prisma.r_user.update({
            where: { id_user: userId },
            data: {
              authentication: updatedCredentials,
              upd_at: new Date()
            }
          });

          console.log(`Password automatically migrated for user ID: ${userId}`);
        }
      } catch (error) {
        console.error('Error migrating password during login:', error);
        // Don't fail login if migration fails, just log it
      }
    }

    return isValid;
  }

  // Fallback for unknown hash format
  return false;
}

async function login({ user, password }) {
  if (!user || !password) {
    return { ok: false, status: 400, error: "user and password are required" };
  }

  const dbUser = await findUserByLogin(user);

  if (!dbUser || dbUser.is_active !== true) {
    return { ok: false, status: 401, error: "Invalid credentials" };
  }

  const cred = getLatestCredential(dbUser.authentication);
  if (!cred?.password) {
    return { ok: false, status: 500, error: "User has no password in authentication JSONB" };
  }

  const isValidPassword = await verifyPasswordWithMigration(password, cred.password, dbUser.id_user);
  if (!isValidPassword) {
    return { ok: false, status: 401, error: "Invalid credentials" };
  }

  // Expiración password
  const exp = parseYmdDate(cred.expired);
  if (exp) {
    const today = todayUtcYmd();
    if (today.getTime() > exp.getTime()) {
      return {
        ok: false,
        status: 403,
        error: "Password expired",
        code: "PASSWORD_EXPIRED",
        requireChange: true,
        user: buildUserPayload(dbUser),
      };
    }
  }

  // If OTP is enabled, always require OTP challenge.
  const otp = otpInfo(dbUser.additional);
  const firstLogin = dbUser.additional?.first_login === true;

  if (otp.enabled) {
    const challengeToken = signChallenge({
      sub: toJwtSafe(dbUser.id_user),
      login: dbUser.login,
      stage: "OTP_REQUIRED",
    });

    return {
      ok: true,
      status: 200,
      data: {
        requireOtp: true,
        firstLogin,
        challengeToken,
        user: buildUserPayload(dbUser),
      },
    };
  }

  // On first login, generate OTP secret but don't require it yet
  let otpSetupData = null;
  if (firstLogin && !otp.secret) {
    const secret = authenticator.generateSecret();
    const label = `ShowDeal:${dbUser.login}`;
    const otpauth_url = authenticator.keyuri(dbUser.login, "ShowDeal", secret);

    const currentAdditional = dbUser.additional && typeof dbUser.additional === "object" ? dbUser.additional : {};
    const nextAdditional = {
      ...currentAdditional,
      otp: {
        type: "totp",
        enabled: false,
        secret,
        issuer: "ShowDeal",
        label,
        otpauth_url,
      },
    };

    await prisma.r_user.update({
      where: { id_user: dbUser.id_user },
      data: { additional: nextAdditional },
    });

    otpSetupData = { secret, otpauth_url, issuer: "ShowDeal", label };
  }

  // Si OTP NO está habilitado -> emite JWT directo
  const token = signJwt({
    sub: toJwtSafe(dbUser.id_user),
    login: dbUser.login,
    companyId: toJwtSafe(dbUser.id_company),
    roleId: toJwtSafe(dbUser.id_role),
    roleName: dbUser.roleName,
    isAdmin: dbUser.isAdmin === true,
  });

  return {
    ok: true,
    status: 200,
    data: {
      requireOtp: false,
      firstLogin,
      otpSetup: otpSetupData,
      token,
      user: buildUserPayload(dbUser),
    },
  };
}

async function verifyOtp({ challengeToken, otp }) {
  if (!challengeToken || !otp) {
    return { ok: false, status: 400, error: "challengeToken and otp are required" };
  }

  let payload;
  try {
    payload = verifyChallenge(challengeToken);
  } catch {
    return { ok: false, status: 401, error: "Invalid challengeToken" };
  }

  if (payload?.stage !== "OTP_REQUIRED" || !payload?.sub) {
    return { ok: false, status: 401, error: "Invalid challengeToken stage" };
  }

  const u = await findUserById(payload.sub);
  if (!u || u.is_active !== true) return { ok: false, status: 401, error: "Unauthorized" };

  const otpCfg = otpInfo(u.additional);
  if (!otpCfg.enabled || !otpCfg.secret) {
    return { ok: false, status: 400, error: "TOTP not enabled for this user" };
  }

  const isValid = authenticator.check(String(otp), otpCfg.secret);
  if (!isValid) return { ok: false, status: 401, error: "Invalid OTP" };

  const firstLogin = u.additional?.first_login === true;

  const token = signJwt({
    sub: toJwtSafe(u.id_user),
    login: u.login,
    companyId: toJwtSafe(u.id_company),
    roleId: toJwtSafe(u.id_role),
    roleName: u.roleName,
    isAdmin: u.isAdmin === true,
    amr: ["pwd", "totp"],
  });

  return {
    ok: true,
    status: 200,
    data: {
      token,
      firstLogin,
      user: buildUserPayload(u),
    },
  };
}

async function otpSetup({ id_user, issuer = "ShowDeal" }) {
  // Genera secreto y otpauth_url para QR
  const u = await findUserById(id_user);
  if (!u || u.is_active !== true) return { ok: false, status: 401, error: "Unauthorized" };

  const secret = authenticator.generateSecret();
  const label = `${issuer}:${u.login}`;
  const otpauth_url = authenticator.keyuri(u.login, issuer, secret);

  const currentAdditional = u.additional && typeof u.additional === "object" ? u.additional : {};
  const nextAdditional = {
    ...currentAdditional,
    otp: {
      type: "totp",
      enabled: false,
      secret,
      issuer,
      label,
      otpauth_url,
    },
  };

  await prisma.r_user.update({
    where: { id_user: u.id_user },
    data: { additional: nextAdditional },
  });

  return {
    ok: true,
    status: 200,
    data: { issuer, label, secret, otpauth_url },
  };
}

async function otpEnable({ id_user, otp }) {
  const u = await findUserById(id_user);
  if (!u || u.is_active !== true) return { ok: false, status: 401, error: "Unauthorized" };

  const otpCfg = otpInfo(u.additional);
  const secret = otpCfg.secret;
  if (!secret) return { ok: false, status: 400, error: "No TOTP secret found. Run setup first." };

  const isValid = authenticator.check(String(otp), secret);
  if (!isValid) return { ok: false, status: 401, error: "Invalid OTP" };

  const currentAdditional = u.additional && typeof u.additional === "object" ? u.additional : {};
  const nextAdditional = {
    ...currentAdditional,
    otp: {
      ...(currentAdditional.otp || {}),
      enabled: true,
    },
  };

  await prisma.r_user.update({
    where: { id_user: u.id_user },
    data: { additional: nextAdditional },
  });

  return { ok: true, status: 200, data: { enabled: true } };
}

async function otpDisable({ id_user }) {
  const u = await findUserById(id_user);
  if (!u || u.is_active !== true) return { ok: false, status: 401, error: "Unauthorized" };

  const currentAdditional = u.additional && typeof u.additional === "object" ? u.additional : {};
  const nextAdditional = {
    ...currentAdditional,
    otp: {
      ...(currentAdditional.otp || {}),
      enabled: false,
      secret: null,
    },
  };

  await prisma.r_user.update({
    where: { id_user: u.id_user },
    data: { additional: nextAdditional },
  });

  return { ok: true, status: 200, data: { enabled: false } };
}

async function changePassword({ id_user, currentPassword, newPassword }) {
  const u = await findUserById(id_user);
  if (!u || u.is_active !== true) return { ok: false, status: 401, error: "Unauthorized" };

  const cred = getLatestCredential(u.authentication);
  if (!cred?.password) {
    return { ok: false, status: 500, error: "User has no password in authentication JSONB" };
  }

  // Verify current password
  const isValidPassword = await verifyPasswordWithMigration(currentPassword, cred.password, u.id_user);
  if (!isValidPassword) {
    return { ok: false, status: 401, error: "Current password is incorrect" };
  }

  // Hash new password with bcrypt
  const newHash = await bcryptHash(newPassword);

  const authentication = Array.isArray(u.authentication) ? u.authentication : [];
  const updated = [
    ...authentication,
    {
      type: "password",
      password: newHash,
      created: todayUtcYmd().toISOString().split("T")[0],
      expired: null,
    },
  ];

  // Mark first_login as false if it was true
  const currentAdditional = u.additional && typeof u.additional === "object" ? u.additional : {};
  const nextAdditional = {
    ...currentAdditional,
    first_login: false,
  };

  await prisma.r_user.update({
    where: { id_user: u.id_user },
    data: {
      authentication: updated,
      additional: nextAdditional,
    },
  });

  return { ok: true, status: 200, data: { passwordChanged: true } };
}

async function changePasswordForced({ id_user, newPassword }) {
  const u = await findUserById(id_user);
  if (!u || u.is_active !== true) return { ok: false, status: 401, error: "Unauthorized" };

  // Hash new password with bcrypt
  const newHash = await bcryptHash(newPassword);

  const authentication = Array.isArray(u.authentication) ? u.authentication : [];
  const updated = [
    ...authentication,
    {
      type: "password",
      password: newHash,
      created: todayUtcYmd().toISOString().split("T")[0],
      expired: null,
    },
  ];

  // Mark first_login as false
  const currentAdditional = u.additional && typeof u.additional === "object" ? u.additional : {};
  const nextAdditional = {
    ...currentAdditional,
    first_login: false,
  };

  await prisma.r_user.update({
    where: { id_user: u.id_user },
    data: {
      authentication: updated,
      additional: nextAdditional,
    },
  });

  return { ok: true, status: 200, data: { passwordChanged: true } };
}

module.exports = { login, verifyOtp, otpSetup, otpEnable, otpDisable, changePassword, changePasswordForced, verifyPassword, verifyPasswordWithMigration };
