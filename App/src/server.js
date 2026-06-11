require("dotenv").config();
const { createApp } = require("./app");
const { ensureCoreModules } = require("./routes/module-catalog");

const PORT = Number(process.env.PORT || 3001);

// Fix global para que Express pueda responder BigInt (Postgres int8)
BigInt.prototype.toJSON = function () {
  return this.toString();
};

async function main() {
  // Ensure module catalog exists so r_access can grant permissions by role/module.
  try {
    await ensureCoreModules();
  } catch (err) {
    console.warn("[showdeal-api] core modules skipped until DB setup:", err.message);
  }

  const app = createApp();

  app.listen(PORT, () => {
    console.log(`[showdeal-api] listening on http://localhost:${PORT}`);
    console.log(`[showdeal-api] health: http://localhost:${PORT}/health`);
  });
}

main().catch((err) => {
  console.error("[showdeal-api] fatal error:", err);
  process.exit(1);
});
