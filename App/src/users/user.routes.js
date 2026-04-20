const router = require("express").Router();
const { requireAuth, jsonSafe } = require("../auth/auth.middleware");
const { requireModuleAccess } = require("../routes/access.guard");
const { requireOwnership, filterByOwnership } = require("../routes/ownership.middleware");
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
    return res.status(201).json(jsonSafe({ ok: true, data }));
  } catch (err) {
    return next(err);
  }
});

router.put("/:id", requireModuleAccess("r_user", "update"), requireOwnership("r_user"), async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const data = await updateUser(id, req.body || {});
    return res.json(jsonSafe({ ok: true, data }));
  } catch (err) {
    return next(err);
  }
});

router.delete("/:id", requireModuleAccess("r_user", "delete"), requireOwnership("r_user"), async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const data = await deleteUser(id);
    return res.json(jsonSafe({ ok: true, data }));
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
