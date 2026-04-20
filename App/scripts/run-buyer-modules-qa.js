require("dotenv").config();

if (process.env.NODE_ENV !== "production") {
  const hasTotp = String(process.env.QA_TOTP_SECRET || "").trim();
  const hasBearer = String(process.env.QA_BEARER_TOKEN || "").trim();
  if (!hasTotp && !hasBearer && String(process.env.QA_SKIP_OTP || "").trim() === "") {
    process.env.QA_SKIP_OTP = "1";
  }
}

if (!process.env.QA_LOGIN_USER) process.env.QA_LOGIN_USER = "buyer";
if (!process.env.QA_LOGIN_PASSWORD) process.env.QA_LOGIN_PASSWORD = "password123";

require("./test-modules-buyer.js");
