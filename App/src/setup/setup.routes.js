const router = require("express").Router();
const { ZodError } = require("zod");
const { bootstrapInitialSetup, isSystemConfigured } = require("./setup.service");

// Setup is a one-time, highly sensitive operation (creates DB roles, writes .env,
// runs `prisma db push`). It can be fully disabled via env in production and/or
// protected with a one-time install token.
function setupGuard(req, res, next) {
  if (String(process.env.DISABLE_SETUP).toLowerCase() === "true") {
    return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  }

  // In production, SETUP_TOKEN is mandatory. Fail closed if not configured.
  const isProduction = process.env.NODE_ENV === "production";
  const requiredToken = process.env.SETUP_TOKEN;

  if (isProduction && !requiredToken) {
    return res.status(503).json({ ok: false, error: "SETUP_DISABLED" });
  }

  if (requiredToken) {
    const provided = req.get("x-setup-token");
    if (!provided || provided !== requiredToken) {
      return res.status(403).json({ ok: false, error: "SETUP_TOKEN_REQUIRED" });
    }
  }

  return next();
}

router.get("/status", async (_req, res, next) => {
  try {
    const configured = await isSystemConfigured();
    return res.json({ ok: true, configured });
  } catch (err) {
    return next(err);
  }
});

router.post("/bootstrap", setupGuard, async (req, res, next) => {
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
