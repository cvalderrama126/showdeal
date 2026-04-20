const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { prisma } = require("../db/prisma");

function parseYmdDate(s) {
  if (!s || typeof s !== "string") return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function todayUtcYmdString() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

  return best || arr[arr.length - 1] || null;
}

function redactAdditional(additional) {
  if (!additional || typeof additional !== "object") return additional ?? null;

  const clone = { ...additional };
  if (clone.otp && typeof clone.otp === "object") {
    clone.otp = {
      enabled: clone.otp.enabled === true,
      issuer: clone.otp.issuer || null,
      label: clone.otp.label || null,
      type: clone.otp.type || "totp",
    };
  }

  return clone;
}

function serializeUser(user, { companyMap, roleMap } = {}) {
  const latestCredential = getLatestCredential(user.authentication);
  const companyName = user.r_company?.company || companyMap?.get(String(user.id_company)) || null;
  const roleName = user.r_role?.role || roleMap?.get(String(user.id_role)) || null;

  return {
    id_user: user.id_user,
    ins_at: user.ins_at,
    upd_at: user.upd_at,
    is_active: user.is_active,
    id_company: user.id_company,
    id_role: user.id_role,
    uin: user.uin,
    user: user.user_1,
    user_1: user.user_1,
    name: user.name,
    company_name: companyName,
    role_name: roleName,
    additional: redactAdditional(user.additional),
    password_meta: latestCredential
      ? {
          created: latestCredential.created || null,
          expired: latestCredential.expired || null,
          algorithm: latestCredential.algorithm || null,
        }
      : null,
    otp_enabled: user.additional?.otp?.enabled === true,
  };
}

async function buildUserLabelMaps(rows) {
  const companyIds = Array.from(
    new Set(
      (Array.isArray(rows) ? rows : [])
        .map((row) => row?.id_company)
        .filter((value) => value !== null && value !== undefined)
        .map((value) => BigInt(String(value)))
    )
  );

  const roleIds = Array.from(
    new Set(
      (Array.isArray(rows) ? rows : [])
        .map((row) => row?.id_role)
        .filter((value) => value !== null && value !== undefined)
        .map((value) => BigInt(String(value)))
    )
  );

  const [companies, roles] = await Promise.all([
    companyIds.length
      ? prisma.r_company.findMany({
          where: { id_company: { in: companyIds } },
          select: {
            id_company: true,
            company: true,
          },
        })
      : Promise.resolve([]),
    roleIds.length
      ? prisma.r_role.findMany({
          where: { id_role: { in: roleIds } },
          select: {
            id_role: true,
            role: true,
          },
        })
      : Promise.resolve([]),
  ]);

  return {
    companyMap: new Map(companies.map((item) => [String(item.id_company), item.company])),
    roleMap: new Map(roles.map((item) => [String(item.id_role), item.role])),
  };
}

function parseBigIntInput(value, fieldName) {
  const s = String(value ?? "").trim();
  if (!/^\d+$/.test(s)) {
    throw toHttpError(400, `INVALID_${fieldName.toUpperCase()}`);
  }
  return BigInt(s);
}

function parseOptionalBigIntInput(value, fieldName) {
  const s = String(value ?? "").trim();
  if (!s) return undefined;
  if (!/^\d+$/.test(s)) {
    throw toHttpError(400, `INVALID_${fieldName.toUpperCase()}`);
  }
  return BigInt(s);
}

function normalizeOptionalDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw toHttpError(400, "INVALID_DATE");
  }
  return text;
}

const userBaseSchema = z
  .object({
    id_company: z.union([z.string(), z.number(), z.bigint()]),
    id_role: z.union([z.string(), z.number(), z.bigint()]),
    uin: z.string().trim().min(1),
    user: z.string().trim().min(1).optional(),
    user_1: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1),
    is_active: z.boolean().optional().default(true),
    additional: z.any().nullable().optional(),
    password: z.string().min(8).optional(),
    password_created: z.string().trim().optional().nullable(),
    password_expires: z.string().trim().optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (!value.user && !value.user_1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "user is required",
        path: ["user"],
      });
    }
  });

function toValidationError(error) {
  const details = error?.issues?.map((issue) => issue.message).join(", ");
  const err = new Error(details || "INVALID_USER_PAYLOAD");
  err.status = 400;
  err.meta = error?.issues || null;
  return err;
}

function toHttpError(status, message, meta) {
  const err = new Error(message);
  err.status = status;
  if (meta) err.meta = meta;
  return err;
}

function parseUserInput(input, { requirePassword }) {
  const parsed = userBaseSchema.safeParse(input || {});
  if (!parsed.success) {
    throw toValidationError(parsed.error);
  }

  const data = parsed.data;
  const hasAdditional = Object.prototype.hasOwnProperty.call(input || {}, "additional");
  const login = String(data.user ?? data.user_1).trim();
  const passwordCreated = data.password_created ? normalizeOptionalDate(data.password_created) : todayUtcYmdString();
  const passwordExpires = normalizeOptionalDate(data.password_expires);

  if (requirePassword && !data.password) {
    throw toHttpError(400, "PASSWORD_REQUIRED");
  }

  return {
    id_company: parseBigIntInput(data.id_company, "id_company"),
    id_role: parseBigIntInput(data.id_role, "id_role"),
    uin: data.uin.trim(),
    user_1: login,
    name: data.name.trim(),
    is_active: data.is_active !== false,
    additional: data.additional ?? null,
    hasAdditional,
    password: data.password || null,
    password_created: passwordCreated,
    password_expires: passwordExpires,
  };
}

async function buildCredential(password, created, expired) {
  const hash = await bcrypt.hash(password, 12);
  return {
    password: hash,
    algorithm: "bcrypt",
    created: created || todayUtcYmdString(),
    expired: expired || null,
  };
}

async function listUsers({
  take = 50,
  skip = 0,
  includeInactive = false,
  q = "",
  id_company,
  id_role,
  ownershipFilter,
} = {}) {
  const where = includeInactive ? {} : { is_active: true };
  const companyId = parseOptionalBigIntInput(id_company, "id_company");
  const roleId = parseOptionalBigIntInput(id_role, "id_role");
  const search = String(q || "").trim();

  if (companyId) where.id_company = companyId;
  if (roleId) where.id_role = roleId;

  // Apply ownership filter if provided
  if (ownershipFilter) {
    Object.assign(where, ownershipFilter);
  }

  if (search) {
    where.OR = [
      { uin: { contains: search, mode: "insensitive" } },
      { user_1: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
      { r_company: { is: { company: { contains: search, mode: "insensitive" } } } },
      { r_role: { is: { role: { contains: search, mode: "insensitive" } } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.r_user.findMany({
      where,
      take,
      skip,
      orderBy: { id_user: "desc" },
    }),
    prisma.r_user.count({ where }),
  ]);

  const labelMaps = await buildUserLabelMaps(rows);

  return {
    rows: rows.map((row) => serializeUser(row, labelMaps)),
    meta: {
      take,
      skip,
      total,
      hasMore: skip + rows.length < total,
    },
  };
}

async function getUserById(id_user) {
  const row = await prisma.r_user.findUnique({
    where: { id_user: BigInt(String(id_user)) },
  });

  if (!row) return null;
  const labelMaps = await buildUserLabelMaps([row]);
  return serializeUser(row, labelMaps);
}

async function getRawUserById(id_user) {
  return prisma.r_user.findUnique({
    where: { id_user: BigInt(String(id_user)) },
  });
}

async function ensureUniqueLogin(login, excludeId = null) {
  const existing = await prisma.r_user.findFirst({
    where: {
      user_1: login,
      ...(excludeId ? { NOT: { id_user: BigInt(String(excludeId)) } } : {}),
    },
    select: { id_user: true },
  });

  if (existing) {
    throw toHttpError(409, "USER_ALREADY_EXISTS");
  }
}

async function createUser(input) {
  const data = parseUserInput(input, { requirePassword: true });
  await ensureUniqueLogin(data.user_1);

  const authentication = [
    await buildCredential(data.password, data.password_created, data.password_expires),
  ];

  const created = await prisma.r_user.create({
    data: {
      id_company: data.id_company,
      id_role: data.id_role,
      uin: data.uin,
      user_1: data.user_1,
      name: data.name,
      is_active: data.is_active,
      additional: data.additional,
      authentication,
    },
  });

  return getUserById(created.id_user);
}

async function updateUser(id_user, input) {
  const current = await getRawUserById(id_user);
  if (!current) {
    throw toHttpError(404, "USER_NOT_FOUND");
  }

  const data = parseUserInput(input, { requirePassword: false });
  await ensureUniqueLogin(data.user_1, id_user);

  const updateData = {
    id_company: data.id_company,
    id_role: data.id_role,
    uin: data.uin,
    user_1: data.user_1,
    name: data.name,
    is_active: data.is_active,
  };

  if (data.hasAdditional) {
    updateData.additional = data.additional;
  }

  if (data.password) {
    const currentAuth = Array.isArray(current.authentication) ? [...current.authentication] : [];
    currentAuth.push(await buildCredential(data.password, data.password_created, data.password_expires));
    updateData.authentication = currentAuth;
  }

  const updated = await prisma.r_user.update({
    where: { id_user: BigInt(String(id_user)) },
    data: updateData,
  });

  return getUserById(updated.id_user);
}

async function deleteUser(id_user) {
  const updated = await prisma.r_user.update({
    where: { id_user: BigInt(String(id_user)) },
    data: { is_active: false },
  });

  return getUserById(updated.id_user);
}

async function listUserOptions() {
  const [companies, roles] = await Promise.all([
    prisma.r_company.findMany({
      where: { is_active: true },
      orderBy: { company: "asc" },
      select: {
        id_company: true,
        company: true,
      },
    }),
    prisma.r_role.findMany({
      where: { is_active: true },
      orderBy: { role: "asc" },
      select: {
        id_role: true,
        role: true,
      },
    }),
  ]);

  return { companies, roles };
}

module.exports = {
  createUser,
  deleteUser,
  getUserById,
  listUserOptions,
  listUsers,
  updateUser,
};
