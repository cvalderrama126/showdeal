const router = require("express").Router();
const { prisma } = require("../db/prisma");

router.get("/", async (req, res) => {
  const base = {
    ok: true,
    healthy: true,
    status: "ok",
    service: "showdeal-api",
    time: new Date().toISOString(),
  };

  try {
    await prisma.$queryRaw`SELECT 1 as ok`;
    res.json({ ...base, db: "ok", mode: "liveness" });
  } catch (err) {
    res.json({
      ...base,
      healthy: false,
      status: "degraded",
      db: "error",
      mode: "liveness",
      error: "DB_UNAVAILABLE",
    });
  }
});

router.get("/ready", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1 as ok`;
    return res.json({
      ok: true,
      healthy: true,
      status: "ok",
      mode: "readiness",
      service: "showdeal-api",
      db: "ok",
      time: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(503).json({
      ok: false,
      healthy: false,
      status: "error",
      mode: "readiness",
      service: "showdeal-api",
      db: "error",
      error: "DB_UNAVAILABLE",
      time: new Date().toISOString(),
    });
  }
});

module.exports = router;