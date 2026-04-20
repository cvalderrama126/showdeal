const { hashFileIntegrity } = require("../utils/crypto.utils");
const { prisma } = require("../db/prisma");

function toHttpError(status, message, meta) {
  const err = new Error(message);
  err.status = status;
  if (meta) err.meta = meta;
  return err;
}

function parseBigIntInput(value, fieldName, { required = true } = {}) {
  const text = String(value ?? "").trim();
  if (!text) {
    if (required) throw toHttpError(400, `INVALID_${fieldName.toUpperCase()}`);
    return undefined;
  }
  if (!/^\d+$/.test(text)) {
    throw toHttpError(400, `INVALID_${fieldName.toUpperCase()}`);
  }
  return BigInt(text);
}

function parseTextInput(value, fieldName, { required = true } = {}) {
  const text = String(value ?? "").trim();
  if (!text) {
    if (required) throw toHttpError(400, `INVALID_${fieldName.toUpperCase()}`);
    return undefined;
  }
  return text;
}

function parseBooleanInput(value, fieldName, { defaultValue } = {}) {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (typeof value === "boolean") return value;

  const text = String(value).trim().toLowerCase();
  if (["true", "1", "on", "yes", "si"].includes(text)) return true;
  if (["false", "0", "off", "no"].includes(text)) return false;

  throw toHttpError(400, `INVALID_${fieldName.toUpperCase()}`);
}

function parseJsonField(value) {
  if (value === undefined) return { hasValue: false, value: null };
  if (value === null || value === "") return { hasValue: true, value: null };
  if (typeof value !== "string") return { hasValue: true, value };

  try {
    return { hasValue: true, value: JSON.parse(value) };
  } catch {
    throw toHttpError(400, "INVALID_ADDITIONAL_JSON");
  }
}
/**
 * Sanitize filename to prevent path traversal attacks
 * @param {string} filename - Original filename
 * @returns {string} Sanitized filename
 */
function sanitizeFileName(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed_file';
  }

  // Remove path traversal sequences
  let sanitized = filename
    .replace(/\.\./g, '') // Remove ..
    .replace(/[\/\\]/g, '') // Remove / and \
    .replace(/[<>:*?"|]/g, '') // Remove invalid characters
    .trim();

  // Ensure filename is not empty and has reasonable length
  if (!sanitized || sanitized.length === 0) {
    sanitized = 'unnamed_file';
  }

  if (sanitized.length > 255) {
    sanitized = sanitized.substring(0, 255);
  }

  return sanitized;
}
function parseOptionalQueryBigInt(value) {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  if (!/^\d+$/.test(text)) throw toHttpError(400, "INVALID_ID_ASSET");
  return BigInt(text);
}

function relationSelect() {
  return {
    r_asset: {
      select: {
        id_asset: true,
        uin: true,
        tp_asset: true,
        status: true,
      },
    },
  };
}

function serializeAttachment(row) {
  return {
    id_attach: row.id_attach,
    ins_at: row.ins_at,
    upd_at: row.upd_at,
    is_active: row.is_active,
    id_asset: row.id_asset,
    tp_attach: row.tp_attach,
    file_name: row.file_name,
    mime_type: row.mime_type,
    file_size_bytes: row.file_size_bytes,
    file_hash: row.file_hash,
    has_content: Buffer.isBuffer(row.file_content) ? row.file_content.length > 0 : !!row.file_content,
    additional: row.additional ?? null,
    asset_uin: row.r_asset?.uin || null,
    asset_type: row.r_asset?.tp_asset || null,
    asset_status: row.r_asset?.status || null,
    download_url: `/api/r_attach/${row.id_attach}/download`,
  };
}

function buildFilePayload(file) {
  if (!file?.buffer) return null;

  const content = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer);
  const fileHash = hashFileIntegrity(content);

  return {
    file_name: String(file.originalname || "").trim() || null,
    mime_type: String(file.mimetype || "").trim() || "application/octet-stream",
    file_size_bytes: BigInt(content.length),
    file_hash: fileHash,
    file_content: content,
  };
}

async function ensureAssetExists(id_asset) {
  const asset = await prisma.r_asset.findUnique({
    where: { id_asset },
    select: {
      id_asset: true,
    },
  });

  if (!asset) {
    throw toHttpError(404, "ASSET_NOT_FOUND");
  }
}

async function findByAssetAndHash(id_asset, file_hash, excludeId = null) {
  if (!id_asset || !file_hash) return null;

  return prisma.r_attach.findFirst({
    where: {
      id_asset,
      file_hash,
      ...(excludeId ? { NOT: { id_attach: excludeId } } : {}),
    },
    include: relationSelect(),
  });
}

function normalizeCreateInput(input) {
  const additional = parseJsonField(input?.additional);

  return {
    id_asset: parseBigIntInput(input?.id_asset, "id_asset"),
    tp_attach: parseTextInput(input?.tp_attach, "tp_attach"),
    is_active: parseBooleanInput(input?.is_active, "is_active", { defaultValue: true }),
    additional: additional.value,
  };
}

function normalizeUpdateInput(input) {
  const payload = {};
  let hasChanges = false;

  if (Object.prototype.hasOwnProperty.call(input || {}, "id_asset")) {
    payload.id_asset = parseBigIntInput(input.id_asset, "id_asset");
    hasChanges = true;
  }

  if (Object.prototype.hasOwnProperty.call(input || {}, "tp_attach")) {
    payload.tp_attach = parseTextInput(input.tp_attach, "tp_attach");
    hasChanges = true;
  }

  if (Object.prototype.hasOwnProperty.call(input || {}, "is_active")) {
    payload.is_active = parseBooleanInput(input.is_active, "is_active");
    hasChanges = true;
  }

  if (Object.prototype.hasOwnProperty.call(input || {}, "additional")) {
    payload.additional = parseJsonField(input.additional).value;
    hasChanges = true;
  }

  return { payload, hasChanges };
}

function buildWhereClause({ includeInactive = false, q, id_asset, tp_attach }) {
  const where = {};

  if (!includeInactive) {
    where.is_active = true;
  }

  if (id_asset) {
    where.id_asset = id_asset;
  }

  if (tp_attach) {
    where.tp_attach = { contains: tp_attach, mode: "insensitive" };
  }

  const search = String(q || "").trim();
  if (search) {
    where.OR = [
      { tp_attach: { contains: search, mode: "insensitive" } },
      { file_name: { contains: search, mode: "insensitive" } },
      { mime_type: { contains: search, mode: "insensitive" } },
      { file_hash: { contains: search, mode: "insensitive" } },
      { r_asset: { is: { uin: { contains: search, mode: "insensitive" } } } },
      { r_asset: { is: { tp_asset: { contains: search, mode: "insensitive" } } } },
    ];
  }

  return where;
}

async function listAttachments({
  take = 25,
  skip = 0,
  includeInactive = false,
  q = "",
  id_asset,
  tp_attach,
} = {}) {
  const where = buildWhereClause({
    includeInactive,
    q,
    id_asset: parseOptionalQueryBigInt(id_asset),
    tp_attach: String(tp_attach || "").trim(),
  });

  const [rows, total] = await Promise.all([
    prisma.r_attach.findMany({
      where,
      take,
      skip,
      orderBy: { id_attach: "desc" },
      include: relationSelect(),
    }),
    prisma.r_attach.count({ where }),
  ]);

  return {
    rows: rows.map(serializeAttachment),
    meta: {
      take,
      skip,
      total,
      hasMore: skip + rows.length < total,
    },
  };
}

async function getAttachmentById(id_attach, { includeInactive = false } = {}) {
  const row = await prisma.r_attach.findUnique({
    where: { id_attach: BigInt(String(id_attach)) },
    include: relationSelect(),
  });

  if (!row) return null;
  if (!includeInactive && row.is_active === false) return null;
  return serializeAttachment(row);
}

async function createAttachment(input, file) {
  const data = normalizeCreateInput(input);
  const filePayload = buildFilePayload(file);

  if (!filePayload) {
    throw toHttpError(400, "FILE_REQUIRED");
  }

  await ensureAssetExists(data.id_asset);

  const duplicate = await findByAssetAndHash(data.id_asset, filePayload.file_hash);
  if (duplicate) {
    if (duplicate.is_active === false) {
      const restored = await prisma.r_attach.update({
        where: { id_attach: duplicate.id_attach },
        data: {
          id_asset: data.id_asset,
          tp_attach: data.tp_attach,
          is_active: data.is_active,
          additional: data.additional,
          ...filePayload,
        },
        include: relationSelect(),
      });

      return serializeAttachment(restored);
    }

    throw toHttpError(409, "ATTACHMENT_ALREADY_EXISTS");
  }

  const created = await prisma.r_attach.create({
    data: {
      id_asset: data.id_asset,
      tp_attach: data.tp_attach,
      is_active: data.is_active,
      additional: data.additional,
      ...filePayload,
    },
    include: relationSelect(),
  });

  return serializeAttachment(created);
}

async function updateAttachment(id_attach, input, file) {
  const current = await prisma.r_attach.findUnique({
    where: { id_attach: BigInt(String(id_attach)) },
    include: relationSelect(),
  });

  if (!current) {
    throw toHttpError(404, "ATTACHMENT_NOT_FOUND");
  }

  const { payload, hasChanges } = normalizeUpdateInput(input);
  const filePayload = buildFilePayload(file);

  if (!hasChanges && !filePayload) {
    throw toHttpError(400, "EMPTY_PAYLOAD");
  }

  const nextAssetId = payload.id_asset ?? current.id_asset;
  if (payload.id_asset) {
    await ensureAssetExists(payload.id_asset);
  }

  const nextHash = filePayload?.file_hash || current.file_hash;
  const duplicate = await findByAssetAndHash(nextAssetId, nextHash, current.id_attach);
  if (duplicate) {
    throw toHttpError(409, "ATTACHMENT_ALREADY_EXISTS");
  }

  const updated = await prisma.r_attach.update({
    where: { id_attach: BigInt(String(id_attach)) },
    data: {
      ...payload,
      ...(filePayload || {}),
    },
    include: relationSelect(),
  });

  return serializeAttachment(updated);
}

async function deleteAttachment(id_attach) {
  const updated = await prisma.r_attach.update({
    where: { id_attach: BigInt(String(id_attach)) },
    data: { is_active: false },
    include: relationSelect(),
  });

  return serializeAttachment(updated);
}

async function getAttachmentDownload(id_attach, { includeInactive = false } = {}) {
  // ✅ SECURITY: Validate ID format to prevent injection
  if (!id_attach || !/^\d+$/.test(String(id_attach))) {
    throw toHttpError(400, "INVALID_ATTACHMENT_ID");
  }

  const row = await prisma.r_attach.findUnique({
    where: { id_attach: BigInt(String(id_attach)) },
    select: {
      id_attach: true,
      is_active: true,
      file_name: true,
      mime_type: true,
      file_size_bytes: true,
      file_content: true,
    },
  });

  if (!row) {
    throw toHttpError(404, "ATTACHMENT_NOT_FOUND");
  }

  if (!includeInactive && row.is_active === false) {
    throw toHttpError(404, "ATTACHMENT_NOT_FOUND");
  }

  if (!row.file_content) {
    throw toHttpError(404, "ATTACHMENT_FILE_NOT_FOUND");
  }

  // ✅ SECURITY: Sanitize filename to prevent path traversal
  const sanitizedFileName = sanitizeFileName(row.file_name);

  return {
    ...row,
    file_name: sanitizedFileName
  };
}

async function listAttachmentOptions() {
  const [assets, attachmentTypes] = await Promise.all([
    prisma.r_asset.findMany({
      where: { is_active: true },
      orderBy: { uin: "asc" },
      select: {
        id_asset: true,
        uin: true,
        tp_asset: true,
        status: true,
      },
    }),
    prisma.r_attach.findMany({
      distinct: ["tp_attach"],
      orderBy: { tp_attach: "asc" },
      select: {
        tp_attach: true,
      },
    }),
  ]);

  return {
    assets,
    attachmentTypes: attachmentTypes
      .map((item) => item.tp_attach)
      .filter(Boolean),
  };
}

module.exports = {
  createAttachment,
  deleteAttachment,
  getAttachmentById,
  getAttachmentDownload,
  listAttachmentOptions,
  listAttachments,
  updateAttachment,
};
