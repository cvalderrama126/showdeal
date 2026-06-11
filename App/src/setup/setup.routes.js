const router = require("express").Router();
const { ZodError } = require("zod");
const { bootstrapInitialSetup, isSystemConfigured } = require("./setup.service");

router.get("/status", async (_req, res, next) => {
  try {
    const configured = await isSystemConfigured();
    return res.json({ ok: true, configured });
  } catch (err) {
    return next(err);
  }
});

router.post("/bootstrap", async (req, res, next) => {
  try {
    const result = await bootstrapInitialSetup(req.body);
    return res.status(result.status || 201).json(result);
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_SETUP_PAYLOAD",
        details: err.issues?.map((i) => i.message) || [],
      });
    }

    if (err.status === 409) {
      return res.status(409).json({ ok: false, error: "SYSTEM_ALREADY_CONFIGURED" });
    }

    if (err.status === 400) {
      return res.status(400).json({ ok: false, error: err.message || "INVALID_SETUP_CONFIGURATION" });
    }

    if (err.code === "28P01" || err.code === "ECONNREFUSED") {
      return res.status(400).json({
        ok: false,
        error: "DB_CONNECTION_FAILED",
        details: err.message,
      });
    }

    return next(err);
  }
});

module.exports = router;
