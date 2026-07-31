require("dotenv").config();
const { createApp } = require("./app");
const { ensureCoreModules } = require("./routes/module-catalog");

const PORT = Number(process.env.PORT || 3001);

// Fix global para que Express pueda responder BigInt (Postgres int8)
BigInt.prototype.toJSON = function () {
  return this.toString();
};

function validateProductionEnvironment() {
  if (process.env.NODE_ENV !== "production") return;

  const required = [
    "DATABASE_URL",
    "REDIS_URL",
    "JWT_SECRET",
    "JWT_CHALLENGE_SECRET",
    "ALLOWED_ORIGINS",
    "APP_BASE_URL",
  ];
  const missing = required.filter((name) => !String(process.env[name] || "").trim());
  if (missing.length) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }

  const weakSecrets = ["JWT_SECRET", "JWT_CHALLENGE_SECRET"].filter(
    (name) => String(process.env[name]).trim().length < 32
  );
  if (weakSecrets.length) {
    throw new Error(`Production secrets must contain at least 32 characters: ${weakSecrets.join(", ")}`);
  }

  let appBaseUrl;
  try {
    appBaseUrl = new URL(process.env.APP_BASE_URL);
  } catch (_error) {
    throw new Error("APP_BASE_URL must be an absolute URL.");
  }
  if (appBaseUrl.protocol !== "https:") {
    console.warn("[showdeal-api] APP_BASE_URL is not HTTPS. Use HTTPS in production before enabling external access.");
  }
}

async function main() {
  validateProductionEnvironment();
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
