const router = require("express").Router();
const { prisma } = require("../db/prisma");

router.get("/", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1 as ok`;
    res.json({ ok: true, service: "showdeal-api", db: "ok", time: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, service: "showdeal-api", db: "error", message: err?.message || "DB failed" });
  }
});

module.exports = router;