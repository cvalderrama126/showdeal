require("dotenv").config();

const jwt = require("jsonwebtoken");
const { authenticator } = require("otplib");
const { createApp } = require("../src/app");

const MODULES = [
  "r_access",
  "r_asset",
  "r_attach",
  "r_auction",
  "r_bid",
  "r_company",
  "r_connection",
  "r_event",
  "r_invitation",
  "r_log",
  "r_module",
  "r_role",
  "r_user",
];

/** Módulos consultados en GET /auth/permissions (incluye pantallas sin CRUD estándar). */
const PERMISSION_MODULES = [...MODULES, "r_buyer_offer"];

const ID_FIELD = {
  r_access: "id_access",
  r_asset: "id_asset",
  r_attach: "id_attach",
  r_auction: "id_auction",
  r_bid: "id_bid",
  r_company: "id_company",
  r_connection: "id_connection",
  r_event: "id_event",
  r_invitation: "id_invitation",
  r_log: "id_log",
  r_module: "id_module",
  r_role: "id_role",
  r_user: "id_user",
};

const runId = `qa-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function main() {
  const app = createApp();
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, () => resolve(s));
    s.on("error", reject);
  });

  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const results = [];
  const state = {};

  try {
    await runCase(results, "auth", "health", async () => {
      const res = await request(baseUrl, null, "/health");
      assertStatus(res, [200], "health");
      assertOkEnvelope(res, "health");
    });

    const loginUser = process.env.QA_LOGIN_USER || "admin";
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
        "Login requiere OTP. Usa QA_TOTP_SECRET (Base32 del usuario), QA_BEARER_TOKEN (JWT), o en entorno no productivo QA_SKIP_OTP=1."
      );
    });

    await runCase(results, "auth", "me", async () => {
      const res = await request(baseUrl, token, "/auth/me");
      assertStatus(res, [200], "auth/me");
      assertOkEnvelope(res, "auth/me");
    });

    await runCase(results, "auth", "permissions", async () => {
      const query = encodeURIComponent(PERMISSION_MODULES.join(","));
      const res = await request(baseUrl, token, `/auth/permissions?modules=${query}`);
      assertStatus(res, [200], "auth/permissions");
      assertOkEnvelope(res, "auth/permissions");
      for (const moduleName of PERMISSION_MODULES) {
        if (!res.data.data?.[moduleName]) {
          throw new Error(`Missing permissions for ${moduleName}`);
        }
      }
    });

    // Common negative/read tests for every module
    for (const moduleName of MODULES) {
      await runCase(results, moduleName, "list", async () => {
        const suffix = moduleName === "r_log" ? "?take=1" : "?take=5&includeInactive=true";
        const res = await request(baseUrl, token, `/api/${moduleName}${suffix}`);
        assertStatus(res, [200], `${moduleName} list`);
        assertOkEnvelope(res, `${moduleName} list`);
      });

      await runCase(results, moduleName, "get invalid id", async () => {
        const res = await request(baseUrl, token, `/api/${moduleName}/abc`);
        assertStatus(res, [400], `${moduleName} invalid id`);
      });

      await runCase(results, moduleName, "get not found", async () => {
        const res = await request(baseUrl, token, `/api/${moduleName}/999999999999?includeInactive=true`);
        // Some modules answer 403 due ownership checks; both are acceptable for a non-existing resource path.
        assertStatus(res, [403, 404], `${moduleName} not found`);
      });
    }

    await runCase(results, "r_buyer_offer", "list aggregated", async () => {
      const res = await request(baseUrl, token, "/api/r_buyer_offer");
      assertStatus(res, [200], "r_buyer_offer list");
      assertOkEnvelope(res, "r_buyer_offer list");
      if (!Array.isArray(res.data.data)) {
        throw new Error("r_buyer_offer expected data array");
      }
    });

    // r_company CRUD
    await runCase(results, "r_company", "create", async () => {
      const res = await request(baseUrl, token, "/api/r_company", {
        method: "POST",
        body: {
          uin: `COMP-${runId}`,
          company: `QA Company ${runId}`,
          additional: { qa_run: runId },
        },
      });
      assertStatus(res, [201], "r_company create");
      assertOkEnvelope(res, "r_company create");
      state.companyId = String(res.data.data.id_company);
    });

    await runCase(results, "r_company", "update", async () => {
      const res = await request(baseUrl, token, `/api/r_company/${state.companyId}`, {
        method: "PUT",
        body: { company: `QA Company Updated ${runId}` },
      });
      assertStatus(res, [200], "r_company update");
      assertOkEnvelope(res, "r_company update");
    });

    await runCase(results, "r_company", "get by id", async () => {
      const res = await request(baseUrl, token, `/api/r_company/${state.companyId}?includeInactive=true`);
      assertStatus(res, [200], "r_company get");
      assertOkEnvelope(res, "r_company get");
    });

    // r_role CRUD
    await runCase(results, "r_role", "create", async () => {
      const res = await request(baseUrl, token, "/api/r_role", {
        method: "POST",
        body: {
          role: `QA Role ${runId}`,
          additional: { qa_run: runId },
        },
      });
      assertStatus(res, [201], "r_role create");
      assertOkEnvelope(res, "r_role create");
      state.roleId = String(res.data.data.id_role);
    });

    await runCase(results, "r_role", "update", async () => {
      const res = await request(baseUrl, token, `/api/r_role/${state.roleId}`, {
        method: "PUT",
        body: { role: `QA Role Updated ${runId}` },
      });
      assertStatus(res, [200], "r_role update");
      assertOkEnvelope(res, "r_role update");
    });

    // r_module CRUD
    await runCase(results, "r_module", "create", async () => {
      const res = await request(baseUrl, token, "/api/r_module", {
        method: "POST",
        body: {
          module: `qa_module_${runId}`,
          is_admin: false,
          additional: { qa_run: runId },
        },
      });
      assertStatus(res, [201], "r_module create");
      assertOkEnvelope(res, "r_module create");
      state.moduleId = String(res.data.data.id_module);
    });

    await runCase(results, "r_module", "update", async () => {
      const res = await request(baseUrl, token, `/api/r_module/${state.moduleId}`, {
        method: "PUT",
        body: { is_admin: false },
      });
      assertStatus(res, [200], "r_module update");
      assertOkEnvelope(res, "r_module update");
    });

    // r_access CRUD
    await runCase(results, "r_access", "create", async () => {
      const res = await request(baseUrl, token, "/api/r_access", {
        method: "POST",
        body: {
          id_module: state.moduleId,
          id_role: state.roleId,
          is_insert: true,
          is_update: true,
          is_delete: true,
          additional: { qa_run: runId },
        },
      });
      assertStatus(res, [201], "r_access create");
      assertOkEnvelope(res, "r_access create");
      state.accessId = String(res.data.data.id_access);
    });

    await runCase(results, "r_access", "update", async () => {
      const res = await request(baseUrl, token, `/api/r_access/${state.accessId}`, {
        method: "PUT",
        body: { is_delete: false },
      });
      assertStatus(res, [200], "r_access update");
      assertOkEnvelope(res, "r_access update");
    });

    // r_event CRUD
    await runCase(results, "r_event", "create", async () => {
      const start = new Date(Date.now() + 3600 * 1000).toISOString();
      const end = new Date(Date.now() + 7200 * 1000).toISOString();
      const res = await request(baseUrl, token, "/api/r_event", {
        method: "POST",
        body: {
          tp_event: `QA_EVENT_${runId}`,
          start_at: start,
          end_at: end,
          additional: { qa_run: runId },
        },
      });
      assertStatus(res, [201], "r_event create");
      assertOkEnvelope(res, "r_event create");
      state.eventId = String(res.data.data.id_event);
    });

    await runCase(results, "r_event", "update", async () => {
      const res = await request(baseUrl, token, `/api/r_event/${state.eventId}`, {
        method: "PUT",
        body: { tp_event: `QA_EVENT_UPDATED_${runId}` },
      });
      assertStatus(res, [200], "r_event update");
      assertOkEnvelope(res, "r_event update");
    });

    // r_asset CRUD
    await runCase(results, "r_asset", "create", async () => {
      const res = await request(baseUrl, token, "/api/r_asset", {
        method: "POST",
        body: {
          uin: `ASSET-${runId}`,
          tp_asset: "VEHICLE",
          status: "AVAILABLE",
          location_city: "Bogota",
          location_address: `Street ${runId}`,
          additional: { qa_run: runId },
        },
      });
      assertStatus(res, [201], "r_asset create");
      assertOkEnvelope(res, "r_asset create");
      state.assetId = String(res.data.data.id_asset);
    });

    await runCase(results, "r_asset", "update", async () => {
      const res = await request(baseUrl, token, `/api/r_asset/${state.assetId}`, {
        method: "PUT",
        body: { status: "RESERVED" },
      });
      assertStatus(res, [200], "r_asset update");
      assertOkEnvelope(res, "r_asset update");
    });

    // r_connection CRUD
    await runCase(results, "r_connection", "create", async () => {
      const res = await request(baseUrl, token, "/api/r_connection", {
        method: "POST",
        body: {
          id_company: state.companyId,
          id_asset: state.assetId,
          tp_connection: "OWNER",
          additional: { qa_run: runId },
        },
      });
      assertStatus(res, [201], "r_connection create");
      assertOkEnvelope(res, "r_connection create");
      state.connectionId = String(res.data.data.id_connection);
    });

    await runCase(results, "r_connection", "update", async () => {
      const res = await request(baseUrl, token, `/api/r_connection/${state.connectionId}`, {
        method: "PUT",
        body: { tp_connection: "CUSTODIAN" },
      });
      assertStatus(res, [200], "r_connection update");
      assertOkEnvelope(res, "r_connection update");
    });

    // r_user meta + CRUD
    await runCase(results, "r_user", "meta options", async () => {
      const res = await request(baseUrl, token, "/api/r_user/meta/options");
      assertStatus(res, [200], "r_user meta options");
      assertOkEnvelope(res, "r_user meta options");
    });

    await runCase(results, "r_user", "create", async () => {
      const res = await request(baseUrl, token, "/api/r_user", {
        method: "POST",
        body: {
          id_company: state.companyId,
          id_role: state.roleId,
          uin: `USR-${runId}`,
          user: `qa_user_${runId}`,
          name: `QA User ${runId}`,
          password: "password123",
          additional: { qa_run: runId },
        },
      });
      assertStatus(res, [201], "r_user create");
      assertOkEnvelope(res, "r_user create");
      state.userId = String(res.data.data.id_user);
    });

    await runCase(results, "r_user", "update", async () => {
      const res = await request(baseUrl, token, `/api/r_user/${state.userId}`, {
        method: "PUT",
        body: {
          id_company: state.companyId,
          id_role: state.roleId,
          uin: `USR-${runId}`,
          user: `qa_user_${runId}`,
          name: `QA User Updated ${runId}`,
          is_active: true,
          additional: { qa_run: runId, updated: true },
        },
      });
      assertStatus(res, [200], "r_user update");
      assertOkEnvelope(res, "r_user update");
    });

    await runCase(results, "r_user", "get by id", async () => {
      const res = await request(baseUrl, token, `/api/r_user/${state.userId}?includeInactive=true`);
      assertStatus(res, [200], "r_user get");
      assertOkEnvelope(res, "r_user get");
    });

    // r_auction CRUD
    await runCase(results, "r_auction", "create", async () => {
      const res = await request(baseUrl, token, "/api/r_auction", {
        method: "POST",
        body: {
          tp_auction: "LIVE_AUCTION",
          id_event: state.eventId,
          id_asset: state.assetId,
          additional: { qa_run: runId },
        },
      });
      assertStatus(res, [201], "r_auction create");
      assertOkEnvelope(res, "r_auction create");
      state.auctionId = String(res.data.data.id_auction);
    });

    await runCase(results, "r_auction", "update", async () => {
      const res = await request(baseUrl, token, `/api/r_auction/${state.auctionId}`, {
        method: "PUT",
        body: { tp_auction: "SEALED_BID" },
      });
      assertStatus(res, [200], "r_auction update");
      assertOkEnvelope(res, "r_auction update");
    });

    // r_bid CRUD
    await runCase(results, "r_bid", "create", async () => {
      const res = await request(baseUrl, token, "/api/r_bid", {
        method: "POST",
        body: {
          id_auction: state.auctionId,
          id_user: state.userId,
          value: "1000.00",
          additional: { qa_run: runId },
        },
      });
      assertStatus(res, [201], "r_bid create");
      assertOkEnvelope(res, "r_bid create");
      state.bidId = String(res.data.data.id_bid);
    });

    await runCase(results, "r_bid", "update", async () => {
      const res = await request(baseUrl, token, `/api/r_bid/${state.bidId}`, {
        method: "PUT",
        body: { value: "1200.00" },
      });
      assertStatus(res, [200], "r_bid update");
      assertOkEnvelope(res, "r_bid update");
    });

    // r_invitation CRUD
    await runCase(results, "r_invitation", "create", async () => {
      const res = await request(baseUrl, token, "/api/r_invitation", {
        method: "POST",
        body: {
          id_event: state.eventId,
          id_company: state.companyId,
          additional: { qa_run: runId },
        },
      });
      assertStatus(res, [201], "r_invitation create");
      assertOkEnvelope(res, "r_invitation create");
      state.invitationId = String(res.data.data.id_invitation);
    });

    await runCase(results, "r_invitation", "update", async () => {
      const res = await request(baseUrl, token, `/api/r_invitation/${state.invitationId}`, {
        method: "PUT",
        body: { is_active: true },
      });
      assertStatus(res, [200], "r_invitation update");
      assertOkEnvelope(res, "r_invitation update");
    });

    // r_attach meta + CRUD + download
    await runCase(results, "r_attach", "meta options", async () => {
      const res = await request(baseUrl, token, "/api/r_attach/meta/options");
      assertStatus(res, [200], "r_attach meta options");
      assertOkEnvelope(res, "r_attach meta options");
    });

    await runCase(results, "r_attach", "create", async () => {
      // 1x1 transparent PNG
      const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6G6iYAAAAASUVORK5CYII=";
      const pngBytes = Buffer.from(pngBase64, "base64");
      const form = new FormData();
      form.append("id_asset", String(state.assetId));
      form.append("tp_attach", "PHOTO");
      form.append("additional", JSON.stringify({ qa_run: runId }));
      form.append("file", new Blob([pngBytes], { type: "image/png" }), `qa_${runId}.png`);

      const res = await request(baseUrl, token, "/api/r_attach", {
        method: "POST",
        body: form,
      });
      assertStatus(res, [201], "r_attach create");
      assertOkEnvelope(res, "r_attach create");
      state.attachId = String(res.data.data.id_attach);
    });

    await runCase(results, "r_attach", "get by id", async () => {
      const res = await request(baseUrl, token, `/api/r_attach/${state.attachId}?includeInactive=true`);
      assertStatus(res, [200], "r_attach get");
      assertOkEnvelope(res, "r_attach get");
    });

    await runCase(results, "r_attach", "download", async () => {
      const res = await request(baseUrl, token, `/api/r_attach/${state.attachId}/download?includeInactive=true`);
      assertStatus(res, [200], "r_attach download");
    });

    await runCase(results, "r_attach", "update", async () => {
      const form = new FormData();
      form.append("tp_attach", "APPRAISAL");
      form.append("additional", JSON.stringify({ qa_run: runId, updated: true }));
      const res = await request(baseUrl, token, `/api/r_attach/${state.attachId}`, {
        method: "PUT",
        body: form,
      });
      assertStatus(res, [200], "r_attach update");
      assertOkEnvelope(res, "r_attach update");
    });

    // r_log methods policy
    await runCase(results, "r_log", "create not allowed", async () => {
      const res = await request(baseUrl, token, "/api/r_log", {
        method: "POST",
        body: { tp_log: "QA", log: { qa_run: runId } },
      });
      assertStatus(res, [405], "r_log post 405");
    });

    await runCase(results, "r_log", "update not allowed", async () => {
      const res = await request(baseUrl, token, "/api/r_log/1", {
        method: "PUT",
        body: { tp_log: "X" },
      });
      assertStatus(res, [405], "r_log put 405");
    });

    await runCase(results, "r_log", "delete not allowed", async () => {
      const res = await request(baseUrl, token, "/api/r_log/1", {
        method: "DELETE",
      });
      assertStatus(res, [405], "r_log delete 405");
    });

    // Deletes (reverse dependency order)
    async function safeDelete(moduleName, id) {
      if (!id) return;
      await runCase(results, moduleName, "delete", async () => {
        const res = await request(baseUrl, token, `/api/${moduleName}/${id}`, { method: "DELETE" });
        assertStatus(res, [200], `${moduleName} delete`);
        assertOkEnvelope(res, `${moduleName} delete`);
      });
    }

    await safeDelete("r_attach", state.attachId);
    await safeDelete("r_invitation", state.invitationId);
    await safeDelete("r_bid", state.bidId);
    await safeDelete("r_auction", state.auctionId);
    await safeDelete("r_connection", state.connectionId);
    await safeDelete("r_asset", state.assetId);
    await safeDelete("r_event", state.eventId);
    await safeDelete("r_user", state.userId);
    await safeDelete("r_access", state.accessId);
    await safeDelete("r_module", state.moduleId);
    await safeDelete("r_role", state.roleId);
    await safeDelete("r_company", state.companyId);

    // avoid immediate DB lock edge in local PG under heavy rapid calls
    await sleep(150);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const failed = results.filter((r) => !r.ok);
  const passed = results.length - failed.length;

  console.log(`\n[test:modules:all-functions] runId=${runId}`);
  console.log(`[test:modules:all-functions] ${passed}/${results.length} checks OK`);

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

main().catch((error) => {
  console.error("[test:modules:all-functions] fatal", error);
  process.exit(1);
});
