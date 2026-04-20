/**
 * Pruebas orientadas al rol comprador (buyer): login, módulo r_buyer_offer y denegación de rutas admin.
 * Credenciales por defecto: QA_LOGIN_USER=buyer, QA_LOGIN_PASSWORD=password123
 */
require("dotenv").config();

const jwt = require("jsonwebtoken");
const { authenticator } = require("otplib");
const { createApp } = require("../src/app");

const PERMISSION_MODULES = [
  "r_buyer_offer",
  "r_user",
  "r_company",
  "r_asset",
];

async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(baseUrl, token, path, options = {}) {
  const { method = "GET", body, headers = {} } = options;
  const nextHeaders = { ...headers };
  if (token) nextHeaders.Authorization = `Bearer ${token}`;

  let payload = body;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (!isFormData && body !== undefined && body !== null && !(typeof body === "string")) {
    if (!Object.keys(nextHeaders).some((k) => k.toLowerCase() === "content-type")) {
      nextHeaders["Content-Type"] = "application/json";
    }
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: nextHeaders,
    body: payload,
  });

  const data = await readBody(res);
  return { status: res.status, ok: res.ok, data, headers: res.headers };
}

function assertStatus(response, allowed, context) {
  if (!allowed.includes(response.status)) {
    throw new Error(`${context} expected status ${allowed.join("|")}, got ${response.status}: ${JSON.stringify(response.data)}`);
  }
}

function assertOkEnvelope(response, context) {
  if (!response.ok || !response.data || response.data.ok !== true) {
    throw new Error(`${context} expected ok=true: ${JSON.stringify(response.data)}`);
  }
}

async function runCase(results, moduleName, caseName, fn) {
  try {
    await fn();
    results.push({ module: moduleName, case: caseName, ok: true });
  } catch (error) {
    results.push({ module: moduleName, case: caseName, ok: false, error: error.message || String(error) });
  }
}

async function performLogin(baseUrl, results) {
  const loginUser = process.env.QA_LOGIN_USER || "buyer";
  const loginPassword = process.env.QA_LOGIN_PASSWORD || "password123";
  let token = "";

  await runCase(results, "auth", "login", async () => {
    const bearerFromEnv = String(process.env.QA_BEARER_TOKEN || "").trim();
    if (bearerFromEnv) {
      token = bearerFromEnv;
      return;
    }

    const res = await request(baseUrl, null, "/auth/login", {
      method: "POST",
      body: { user: loginUser, password: loginPassword },
    });
    assertStatus(res, [200], "auth/login");
    assertOkEnvelope(res, "auth/login");

    if (!res.data.requireOtp) {
      token = res.data.token || res.data.data?.token || "";
      if (!token) throw new Error(`Token missing: ${JSON.stringify(res.data)}`);
      return;
    }

    const totpSecret = String(process.env.QA_TOTP_SECRET || "").trim();
    if (totpSecret) {
      const challengeToken = res.data.challengeToken;
      if (!challengeToken) throw new Error("requireOtp sin challengeToken");
      authenticator.options = { window: 1 };
      const otp = authenticator.generate(totpSecret);
      const res2 = await request(baseUrl, null, "/auth/otp/verify", {
        method: "POST",
        body: { challengeToken, otp },
      });
      assertStatus(res2, [200], "auth/otp/verify");
      assertOkEnvelope(res2, "auth/otp/verify");
      token = res2.data.token || res2.data.data?.token || "";
      if (!token) throw new Error(`Token missing after OTP: ${JSON.stringify(res2.data)}`);
      return;
    }

    const skipOtp = String(process.env.QA_SKIP_OTP || "").trim() === "1";
    const allowBypass = process.env.NODE_ENV !== "production";
    if (skipOtp && allowBypass) {
      const u = res.data.user;
      if (!u || u.id_user == null) throw new Error("requireOtp sin user en respuesta");
      if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET requerido para QA_SKIP_OTP");
      token = jwt.sign(
        {
          sub: String(u.id_user),
          login: u.user || loginUser,
          companyId: String(u.id_company ?? "0"),
          roleId: String(u.id_role ?? "0"),
          roleName: u.isAdmin === true ? "Admin" : "User",
          isAdmin: u.isAdmin === true,
        },
        process.env.JWT_SECRET,
        { expiresIn: "2h", algorithm: "HS256" }
      );
      return;
    }

    throw new Error(
      "Login requiere OTP. Usa QA_TOTP_SECRET, QA_BEARER_TOKEN o QA_SKIP_OTP=1 (solo no producción)."
    );
  });

  return token;
}

async function main() {
  const app = createApp();
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, () => resolve(s));
    s.on("error", reject);
  });

  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const results = [];
  const loginUser = process.env.QA_LOGIN_USER || "buyer";

  try {
    await runCase(results, "auth", "health", async () => {
      const res = await request(baseUrl, null, "/health");
      assertStatus(res, [200], "health");
      assertOkEnvelope(res, "health");
    });

    const loginPassword = process.env.QA_LOGIN_PASSWORD || "password123";

    await runCase(results, "auth", "login wrong password", async () => {
      const res = await request(baseUrl, null, "/auth/login", {
        method: "POST",
        body: { user: loginUser, password: "__wrong__" },
      });
      assertStatus(res, [401], "wrong password");
      if (res.data?.ok === true) throw new Error("expected ok=false");
    });

    const token = await performLogin(baseUrl, results);

    await runCase(results, "buyer", "me not admin", async () => {
      const res = await request(baseUrl, token, "/auth/me");
      assertStatus(res, [200], "auth/me");
      assertOkEnvelope(res, "auth/me");
      if (res.data.auth?.isAdmin === true) {
        throw new Error("Se esperaba usuario buyer sin isAdmin (revisa el rol en BD)");
      }
    });

    await runCase(results, "buyer", "permissions payload r_buyer_offer", async () => {
      const query = encodeURIComponent(PERMISSION_MODULES.join(","));
      const res = await request(baseUrl, token, `/auth/permissions?modules=${query}`);
      assertStatus(res, [200], "auth/permissions");
      assertOkEnvelope(res, "auth/permissions");
      const row = res.data.data?.r_buyer_offer;
      if (!row || typeof row !== "object") {
        throw new Error("auth/permissions debe incluir clave r_buyer_offer");
      }
      if (row.read !== true) {
        console.warn(
          "[test:modules:buyer] r_buyer_offer.read=false (sin r_access/r_module para ese nombre). Revisa catálogo; el GET /api/r_buyer_offer se prueba aparte."
        );
      }
    });

    await runCase(results, "buyer", "GET /api/r_buyer_offer", async () => {
      const res = await request(baseUrl, token, "/api/r_buyer_offer");
      assertStatus(res, [200], "r_buyer_offer");
      assertOkEnvelope(res, "r_buyer_offer");
      if (!Array.isArray(res.data.data)) {
        throw new Error("r_buyer_offer.data debe ser arreglo");
      }
    });

    const adminOnlySamples = [
      ["r_user", "/api/r_user?take=1"],
      ["r_company", "/api/r_company?take=1"],
      ["r_module", "/api/r_module?take=1"],
    ];

    for (const [name, path] of adminOnlySamples) {
      await runCase(results, "buyer", `${name} list forbidden (403)`, async () => {
        const res = await request(baseUrl, token, path);
        assertStatus(res, [403], `${name} forbidden`);
        if (res.data?.ok === true) throw new Error(`expected failure for ${name}`);
      });
    }

    await runCase(results, "buyer", "r_asset list forbidden (403)", async () => {
      const res = await request(baseUrl, token, "/api/r_asset?take=1&includeInactive=true");
      assertStatus(res, [403], "r_asset");
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const failed = results.filter((r) => !r.ok);
  const passed = results.length - failed.length;

  console.log(`\n[test:modules:buyer] user=${loginUser}`);
  console.log(`[test:modules:buyer] ${passed}/${results.length} checks OK`);

  for (const row of results) {
    if (row.ok) {
      console.log(`OK   [${row.module}] ${row.case}`);
    } else {
      console.log(`FAIL [${row.module}] ${row.case}`);
      console.log(`     ${row.error}`);
    }
  }

  if (failed.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[test:modules:buyer] fatal", err);
  process.exit(1);
});
