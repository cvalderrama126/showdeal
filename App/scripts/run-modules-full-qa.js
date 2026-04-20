/**
 * Ejecuta la suite test-modules-all-functions con bypass de OTP en entornos no productivos
 * cuando no hay QA_TOTP_SECRET ni QA_BEARER_TOKEN (para `npm run qa:modules` en local).
 */
require("dotenv").config();

if (process.env.NODE_ENV !== "production") {
  const hasTotp = String(process.env.QA_TOTP_SECRET || "").trim();
  const hasBearer = String(process.env.QA_BEARER_TOKEN || "").trim();
  const skipExplicit = String(process.env.QA_SKIP_OTP || "").trim();
  if (!hasTotp && !hasBearer && skipExplicit === "") {
    process.env.QA_SKIP_OTP = "1";
  }
}

require("./test-modules-all-functions.js");
