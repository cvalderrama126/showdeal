require("dotenv").config();

const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const { createApp } = require("../src/app");
const { prisma } = require("../src/db/prisma");

const FRONTEND_MODULES = [
  "r_user",
  "r_asset",
  "r_event",
  "r_auction",
  "r_bid",
  "r_buyer_offer",
  "r_module",
  "r_access",
  "r_company",
  "r_role",
  "r_attach",
];

const API_MODULES = [
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

function assertJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET no está configurado en App/.env");
  }
}

function buildAdminToken() {
  assertJwtSecret();
  return jwt.sign(
    {
      // Debe ser un id numérico > 0: rutas como /api/r_buyer_offer validan el subject.
      sub: "1",
      login: "smoke-admin",
      roleId: "1",
      isAdmin: true,
      roleName: "Admin",
    },
    process.env.JWT_SECRET,
    { expiresIn: "10m" }
  );
}

async function listen(app) {
  return await new Promise((resolve, reject) => {
    const server = app.listen(0, () => resolve(server));
    server.on("error", reject);
  });
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

function buildUrl(port, pathname) {
  return `http://127.0.0.1:${port}${pathname}`;
}

async function runCheck(results, name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message || String(error) });
  }
}

async function expectJsonOk(port, pathname, token) {
  const response = await fetch(buildUrl(port, pathname), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await readBody(response);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} en ${pathname}: ${JSON.stringify(body)}`);
  }

  if (body && typeof body === "object" && body.ok === false) {
    throw new Error(`Respuesta fallida en ${pathname}: ${JSON.stringify(body)}`);
  }

  return body;
}

async function expectStaticOk(port, pathname) {
  const response = await fetch(buildUrl(port, pathname));
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} en ${pathname}`);
  }

  if (!body || !body.trim()) {
    throw new Error(`Contenido vacío en ${pathname}`);
  }
}

async function main() {
  const app = createApp();
  const server = await listen(app);
  const port = server.address().port;
  const token = buildAdminToken();
  const results = [];

  try {
    await runCheck(results, "health", async () => {
      const body = await expectJsonOk(port, "/health");
      if (body?.ok !== true) {
        throw new Error("Health no devolvió ok=true");
      }
    });

    await runCheck(results, "auth permissions", async () => {
      const body = await expectJsonOk(
        port,
        `/auth/permissions?modules=${encodeURIComponent(FRONTEND_MODULES.join(","))}`,
        token
      );
      if (!body?.data || typeof body.data !== "object") {
        throw new Error("Permissions no devolvió data");
      }
    });

    await runCheck(results, "home html", async () => {
      await expectStaticOk(port, "/home.html");
    });

    await runCheck(results, "home js", async () => {
      await expectStaticOk(port, "/assets/js/home.js");
    });

    for (const moduleName of FRONTEND_MODULES) {
      await runCheck(results, `frontend ${moduleName}.html`, async () => {
        await expectStaticOk(port, `/modules/${moduleName}/${moduleName}.html`);
      });

      await runCheck(results, `frontend ${moduleName}.js`, async () => {
        await expectStaticOk(port, `/modules/${moduleName}/${moduleName}.js`);
      });
    }

    for (const moduleName of API_MODULES) {
      const suffix = moduleName === "r_log" ? "?take=1" : "?take=1&includeInactive=true";

      await runCheck(results, `api ${moduleName} list`, async () => {
        const body = await expectJsonOk(port, `/api/${moduleName}${suffix}`, token);
        if (!Array.isArray(body?.data)) {
          throw new Error("El endpoint no devolvió un arreglo en data");
        }
      });
    }

    await runCheck(results, "api r_buyer_offer list", async () => {
      const body = await expectJsonOk(port, "/api/r_buyer_offer", token);
      if (!Array.isArray(body?.data)) {
        throw new Error("r_buyer_offer no devolvió un arreglo en data");
      }
    });

    await runCheck(results, "api r_user meta options", async () => {
      const body = await expectJsonOk(port, "/api/r_user/meta/options", token);
      if (!body?.data || !Array.isArray(body.data.companies) || !Array.isArray(body.data.roles)) {
        throw new Error("r_user/meta/options no devolvió compañías y roles");
      }
    });

    await runCheck(results, "api r_attach meta options", async () => {
      const body = await expectJsonOk(port, "/api/r_attach/meta/options", token);
      if (!body?.data || !Array.isArray(body.data.assets) || !Array.isArray(body.data.attachmentTypes)) {
        throw new Error("r_attach/meta/options no devolvió assets y attachmentTypes");
      }
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect().catch(() => {});
  }

  const passed = results.filter((item) => item.ok).length;
  const failed = results.filter((item) => !item.ok);

  console.log("");
  console.log(`[test:modules] ${passed}/${results.length} checks OK`);

  for (const result of results) {
    if (result.ok) {
      console.log(`OK   ${result.name}`);
    } else {
      console.log(`FAIL ${result.name}`);
      console.log(`     ${result.error}`);
    }
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[test:modules] fatal:", error);
  process.exit(1);
});
