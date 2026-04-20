const { Router } = require("express");
const { Prisma } = require("@prisma/client");
const { prisma } = require("../db/prisma");
const { requireModuleAccess } = require("./access.guard");
const { jsonSafe } = require("./jsonSafe");
const { requireOwnership, filterByOwnership } = require("./ownership.middleware");

const SYSTEM_FIELDS = new Set(["ins_at", "upd_at"]);
const MODEL_META_CACHE = new Map();

function createHttpError(status, message, meta) {
  const err = new Error(message);
  err.status = status;
  if (meta) err.meta = meta;
  return err;
}

function toId(idParam) {
  const s = String(idParam || "").trim();

  if (!/^\d+$/.test(s)) {
    throw createHttpError(400, "INVALID_ID");
  }

  return BigInt(s);
}

function toBigIntOrNull(value) {
  const s = String(value || "").trim();
  if (!/^\d+$/.test(s)) return null;
  return BigInt(s);
}

function parseInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (Number.isNaN(parsed)) return fallback;
  if (parsed < min) return fallback;
  return Math.min(parsed, max);
}

function getModelMeta(model) {
  if (MODEL_META_CACHE.has(model)) return MODEL_META_CACHE.get(model);

  const meta = Prisma.dmmf.datamodel.models.find((item) => item.name === model) || null;
  MODEL_META_CACHE.set(model, meta);
  return meta;
}

function getWritableScalarFields(model, idField) {
  const meta = getModelMeta(model);
  if (!meta) {
    throw createHttpError(500, "UNKNOWN_MODEL", { model });
  }

  // Prisma can mark relation FK scalars as readOnly in DMMF for introspected schemas.
  // We still need to allow those fields in CRUD payloads (e.g. id_role, id_module).
  const relationForeignKeys = new Set(
    meta.fields
      .filter((field) => field.kind === "object")
      .flatMap((field) => Array.isArray(field.relationFromFields) ? field.relationFromFields : [])
  );

  return meta.fields.filter((field) => {
    if (field.kind !== "scalar") return false;
    if (field.name === idField) return false;
    if (SYSTEM_FIELDS.has(field.name)) return false;
    if (field.isId || field.isUpdatedAt) return false;
    if (field.isReadOnly && !relationForeignKeys.has(field.name)) return false;
    return true;
  });
}

function getFilterableScalarFields(model) {
  const meta = getModelMeta(model);
  if (!meta) {
    throw createHttpError(500, "UNKNOWN_MODEL", { model });
  }

  return meta.fields.filter((field) => {
    if (field.kind !== "scalar") return false;
    if (SYSTEM_FIELDS.has(field.name)) return false;
    if (field.type === "Json" || field.type === "Bytes") return false;
    return true;
  });
}

function getSearchableStringFields(model) {
  return getFilterableScalarFields(model).filter((field) => field.type === "String");
}

function parseJsonField(fieldName, value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value;

  const text = value.trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw createHttpError(400, "INVALID_JSON_FIELD", { field: fieldName });
  }
}

function coerceFieldValue(field, value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (field.isList) {
    if (!Array.isArray(value)) {
      throw createHttpError(400, "INVALID_LIST_FIELD", { field: field.name });
    }
    return value;
  }

  switch (field.type) {
    case "BigInt": {
      const parsed = toBigIntOrNull(value);
      if (parsed === null) {
        throw createHttpError(400, "INVALID_BIGINT_FIELD", { field: field.name });
      }
      return parsed;
    }
    case "Int": {
      const parsed = Number.parseInt(String(value), 10);
      if (Number.isNaN(parsed)) {
        throw createHttpError(400, "INVALID_INT_FIELD", { field: field.name });
      }
      return parsed;
    }
    case "Float": {
      const parsed = Number.parseFloat(String(value));
      if (Number.isNaN(parsed)) {
        throw createHttpError(400, "INVALID_FLOAT_FIELD", { field: field.name });
      }
      return parsed;
    }
    case "Decimal": {
      const text = String(value).trim();
      if (!text || Number.isNaN(Number(text))) {
        throw createHttpError(400, "INVALID_DECIMAL_FIELD", { field: field.name });
      }
      return text;
    }
    case "Boolean": {
      if (typeof value === "boolean") return value;
      if (value === "true") return true;
      if (value === "false") return false;
      throw createHttpError(400, "INVALID_BOOLEAN_FIELD", { field: field.name });
    }
    case "DateTime": {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw createHttpError(400, "INVALID_DATETIME_FIELD", { field: field.name });
      }
      return parsed;
    }
    case "Json":
      return parseJsonField(field.name, value);
    case "Bytes": {
      if (Buffer.isBuffer(value)) return value;
      if (typeof value !== "string") {
        throw createHttpError(400, "INVALID_BYTES_FIELD", { field: field.name });
      }
      return Buffer.from(value, "base64");
    }
    default:
      return value;
  }
}

function sanitizePayload(model, idField, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw createHttpError(400, "INVALID_BODY");
  }

  const writableFields = getWritableScalarFields(model, idField);
  const allowed = new Map(writableFields.map((field) => [field.name, field]));
  const payload = {};

  for (const [key, rawValue] of Object.entries(body)) {
    const field = allowed.get(key);
    if (!field) continue;

    const value = coerceFieldValue(field, rawValue);
    if (value !== undefined) payload[key] = value;
  }

  if (Object.keys(payload).length === 0) {
    throw createHttpError(400, "EMPTY_PAYLOAD");
  }

  return payload;
}

function buildListWhere(model, { hasIsActive, query }) {
  const where = {};
  const filterableFields = getFilterableScalarFields(model);
  const filterableMap = new Map(filterableFields.map((field) => [field.name, field]));

  // Whitelist of allowed query parameters to prevent injection
  const ALLOWED_PARAMS = new Set([
    'take', 'skip', 'q', 'is_active', 'includeInactive',
    ...filterableFields.map(f => f.name)
  ]);

  // Validate query parameters against whitelist
  for (const param of Object.keys(query)) {
    if (!ALLOWED_PARAMS.has(param)) {
      throw createHttpError(400, "INVALID_QUERY_PARAM", { param });
    }
  }

  if (hasIsActive) {
    const activeField = filterableMap.get("is_active");
    const activeFilter = query.is_active;
    const includeInactive = query.includeInactive === "true";

    if (activeField && activeFilter !== undefined && String(activeFilter).trim() !== "") {
      where.is_active = coerceFieldValue(activeField, activeFilter);
    } else if (!includeInactive) {
      where.is_active = true;
    }
  }

  for (const field of filterableFields) {
    if (field.name === "is_active") continue;
    const rawValue = query[field.name];
    if (rawValue === undefined || rawValue === null) continue;

    const textValue = String(rawValue).trim();
    if (!textValue) continue;

    // Validate field value using coerceFieldValue to ensure type safety
    try {
      if (field.type === "String") {
        where[field.name] = { contains: textValue, mode: "insensitive" };
        continue;
      }

      where[field.name] = coerceFieldValue(field, rawValue);
    } catch (err) {
      throw createHttpError(400, "INVALID_FILTER_VALUE", {
        field: field.name,
        type: field.type,
        value: rawValue
      });
    }
  }

  const search = String(query.q || "").trim();
  // Validate search query length to prevent abuse
  if (search.length > 100) {
    throw createHttpError(400, "SEARCH_QUERY_TOO_LONG", { maxLength: 100 });
  }
  const searchableFields = getSearchableStringFields(model);
  if (search && searchableFields.length) {
    where.OR = searchableFields.map((field) => ({
      [field.name]: { contains: search, mode: "insensitive" },
    }));
  }

  return where;
}

function methodNotAllowed(res, method) {
  return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED", method });
}

function createCrudRouter({
  model,
  idField,
  hasIsActive = true,
  softDelete = true,
  requireAuth = null,
  allowCreate = true,
  allowUpdate = true,
  allowDelete = true,
  ownershipCheck = false, // New parameter for ownership validation
}) {
  const r = Router();

  if (requireAuth) r.use(requireAuth);

  r.get("/", requireModuleAccess(model, "read"), ownershipCheck ? filterByOwnership(model) : (req, res, next) => next(), async (req, res, next) => {
    try {
      const take = parseInteger(req.query.take, 50, { min: 1, max: 200 });
      const skip = parseInteger(req.query.skip, 0, { min: 0, max: 100000 });

      // Additional validation for pagination parameters
      if (req.query.take !== undefined && (take < 1 || take > 200)) {
        throw createHttpError(400, "INVALID_TAKE_PARAM", { min: 1, max: 200 });
      }
      if (req.query.skip !== undefined && (skip < 0 || skip > 100000)) {
        throw createHttpError(400, "INVALID_SKIP_PARAM", { min: 0, max: 100000 });
      }

      const where = buildListWhere(model, { hasIsActive, query: req.query });

      // Apply ownership filter if set
      if (req.ownershipFilter) {
        where.AND = where.AND || [];
        where.AND.push(req.ownershipFilter);
      }

      const [data, total] = await Promise.all([
        prisma[model].findMany({
          where,
          take,
          skip,
          orderBy: { [idField]: "desc" },
        }),
        prisma[model].count({ where }),
      ]);

      res.json({
        ok: true,
        data: jsonSafe(data),
        meta: {
          take,
          skip,
          total,
          hasMore: skip + data.length < total,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  r.get("/:id", requireModuleAccess(model, "read"), ownershipCheck ? requireOwnership(model) : (req, res, next) => next(), async (req, res, next) => {
    try {
      const id = toId(req.params.id);

      // Build where clause combining id with any ownership filter from middleware
      const where = { [idField]: id };
      if (req.ownershipFilter) {
        where.AND = [req.ownershipFilter];
      }

      const data = req.ownershipFilter
        ? await prisma[model].findFirst({ where })
        : await prisma[model].findUnique({ where: { [idField]: id } });

      if (!data || (hasIsActive && data.is_active === false && req.query.includeInactive !== "true")) {
        return res.status(404).json({ ok: false });
      }

      res.json({ ok: true, data: jsonSafe(data) });
    } catch (err) {
      next(err);
    }
  });

  if (allowCreate) {
    r.post("/", requireModuleAccess(model, "create"), async (req, res, next) => {
      try {
        const payload = sanitizePayload(model, idField, req.body);
        const created = await prisma[model].create({
          data: payload,
        });

        res.status(201).json({ ok: true, data: jsonSafe(created) });
      } catch (err) {
        next(err);
      }
    });
  } else {
    r.post("/", (req, res) => methodNotAllowed(res, "POST"));
  }

  if (allowUpdate) {
    r.put("/:id", requireModuleAccess(model, "update"), ownershipCheck ? requireOwnership(model) : (req, res, next) => next(), async (req, res, next) => {
      try {
        const id = toId(req.params.id);
        const payload = sanitizePayload(model, idField, req.body);

        const updated = await prisma[model].update({
          where: { [idField]: id },
          data: payload,
        });

        res.json({ ok: true, data: jsonSafe(updated) });
      } catch (err) {
        next(err);
      }
    });
  } else {
    r.put("/:id", (req, res) => methodNotAllowed(res, "PUT"));
  }

  if (allowDelete) {
    r.delete("/:id", requireModuleAccess(model, "delete"), ownershipCheck ? requireOwnership(model) : (req, res, next) => next(), async (req, res, next) => {
      try {
        const id = toId(req.params.id);

        let result;

        if (softDelete && hasIsActive) {
          result = await prisma[model].update({
            where: { [idField]: id },
            data: { is_active: false },
          });
        } else {
          result = await prisma[model].delete({
            where: { [idField]: id },
          });
        }

        res.json({ ok: true, data: jsonSafe(result) });
      } catch (err) {
        next(err);
      }
    });
  } else {
    r.delete("/:id", (req, res) => methodNotAllowed(res, "DELETE"));
  }

  return r;
}

module.exports = { createCrudRouter };
