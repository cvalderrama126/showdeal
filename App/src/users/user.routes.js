const router = require("express").Router();
const { requireAuth, jsonSafe } = require("../auth/auth.middleware");
const { requireModuleAccess } = require("../routes/access.guard");
const { requireOwnership, filterByOwnership } = require("../routes/ownership.middleware");
const { audit } = require("../utils/audit.service");
const {
  createUser,
  deleteUser,
  getUserById,
  listUserOptions,
  listUsers,
  updateUser,
} = require("./user.service");

function parseInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (Number.isNaN(parsed)) return fallback;
  if (parsed < min) return fallback;
  return Math.min(parsed, max);
}

function toId(idParam) {
  const s = String(idParam || "").trim();
  if (!/^\d+$/.test(s)) {
    const err = new Error("INVALID_ID");
    err.status = 400;
    throw err;
  }
  return BigInt(s);
}

const NON_ADMIN_RESTRICTED_FIELDS = new Set([
  "id_role",
  "id_company",
  "additional",
  "password",
  "user_1",
  "user",
  "authentication",
]);

router.use(requireAuth);

router.get("/meta/options", requireModuleAccess("r_user", "read"), async (req, res, next) => {
  try {
    const data = await listUserOptions();
    return res.json(jsonSafe({ ok: true, data }));
  } catch (err) {
    return next(err);
  }
});

router.get("/", requireModuleAccess("r_user", "read"), filterByOwnership("r_user"), async (req, res, next) => {
  try {
    const take = parseInteger(req.query.take, 50, { min: 1, max: 200 });
    const skip = parseInteger(req.query.skip, 0, { min: 0, max: 100000 });
    const includeInactive = req.query.includeInactive === "true";
    const result = await listUsers({
      take,
      skip,
      includeInactive,
      q: req.query.q,
      id_company: req.query.id_company,
      id_role: req.query.id_role,
      ownershipFilter: req.ownershipFilter, // Apply ownership filter
    });
    return res.json(jsonSafe({ ok: true, data: result.rows, meta: result.meta }));
  } catch (err) {
    return next(err);
  }
});

router.get("/:id", requireModuleAccess("r_user", "read"), requireOwnership("r_user"), async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const data = await getUserById(id);
    if (!data) {
      return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
    }
    return res.json(jsonSafe({ ok: true, data }));
  } catch (err) {
    return next(err);
  }
});

router.post("/", requireModuleAccess("r_user", "create"), async (req, res, next) => {
  try {
    const data = await createUser(req.body || {});
    audit({
      req,
      action: "USER_CREATE",
      entity: "r_user",
      entityId: data?.id_user,
      data: { user: data?.user, name: data?.name, id_company: data?.id_company, id_role: data?.id_role },
    });
    return res.status(201).json(jsonSafe({ ok: true, data }));
  } catch (err) {
    return next(err);
  }
});

router.put("/:id", requireModuleAccess("r_user", "update"), requireOwnership("r_user"), async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (req.auth?.isAdmin !== true) {
      const attemptedSensitiveFields = Object.keys(req.body || {}).filter((key) =>
        NON_ADMIN_RESTRICTED_FIELDS.has(String(key))
      );
      if (attemptedSensitiveFields.length > 0) {
        return res.status(403).json({
          ok: false,
          error: "FORBIDDEN_SENSITIVE_UPDATE",
          fields: attemptedSensitiveFields,
        });
      }
    }
    const data = await updateUser(id, req.body || {});
    audit({
      req,
      action: "USER_UPDATE",
      entity: "r_user",
      entityId: id,
      data: { changedKeys: Object.keys(req.body || {}) },
    });
    return res.json(jsonSafe({ ok: true, data }));
  } catch (err) {
    return next(err);
  }
});

router.delete("/:id", requireModuleAccess("r_user", "delete"), requireOwnership("r_user"), async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const data = await deleteUser(id);
    audit({ req, action: "USER_DELETE", entity: "r_user", entityId: id });
    return res.json(jsonSafe({ ok: true, data }));
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
