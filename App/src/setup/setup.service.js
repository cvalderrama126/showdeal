const { z } = require("zod");
const bcrypt = require("bcryptjs");
const { Client } = require("pg");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const path = require("node:path");
const { prisma } = require("../db/prisma");

const execFileAsync = promisify(execFile);
const APP_ROOT = path.resolve(__dirname, "..", "..");

const setupSchema = z.object({
  dbHost: z.string().trim().min(1).max(255).default("postgres"),
  dbPort: z.coerce.number().int().min(1).max(65535).default(5432),
  installerUser: z.string().trim().min(1).max(63),
  installerPassword: z.string().min(1).max(256),
  dbName: z.string().trim().min(1).max(63),
  appDbUser: z.string().trim().min(1).max(63),
  appDbPassword: z.string().min(1).max(256),
  companyName: z.string().trim().min(2).max(120),
  adminName: z.string().trim().min(2).max(120),
  adminUser: z.string().trim().min(3).max(80),
  adminPassword: z.string().min(8).max(128),
});

function isValidIdentifier(text) {
  return /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(String(text || ""));
}

function quoteIdentifier(text) {
  return `"${String(text).replace(/"/g, '""')}"`;
}

function buildUin(prefix) {
  return `${prefix}-${Date.now()}`;
}

function buildDbUrl({ user, password, host, port, dbName }) {
  const userEncoded = encodeURIComponent(user);
  const passwordEncoded = encodeURIComponent(password);
  return `postgresql://${userEncoded}:${passwordEncoded}@${host}:${port}/${dbName}?schema=showdeal`;
}

async function isSystemConfigured() {
  try {
    const users = await prisma.r_user.count();
    return users > 0;
  } catch {
    return false;
  }
}

async function createDatabaseInfrastructure(cfg) {
  if (!isValidIdentifier(cfg.dbName)) {
    const err = new Error("INVALID_DB_NAME");
    err.status = 400;
    throw err;
  }

  if (!isValidIdentifier(cfg.appDbUser)) {
    const err = new Error("INVALID_DB_USER");
    err.status = 400;
    throw err;
  }

  const installerClient = new Client({
    host: cfg.dbHost,
    port: cfg.dbPort,
    user: cfg.installerUser,
    password: cfg.installerPassword,
    database: "postgres",
  });

  await installerClient.connect();

  try {
    const roleExists = await installerClient.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [
      cfg.appDbUser,
    ]);

    if (roleExists.rowCount === 0) {
      await installerClient.query(
        `CREATE ROLE ${quoteIdentifier(cfg.appDbUser)} WITH LOGIN PASSWORD $1`,
        [cfg.appDbPassword]
      );
    } else {
      await installerClient.query(
        `ALTER ROLE ${quoteIdentifier(cfg.appDbUser)} WITH LOGIN PASSWORD $1`,
        [cfg.appDbPassword]
      );
    }

    const dbExists = await installerClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      cfg.dbName,
    ]);

    if (dbExists.rowCount === 0) {
      await installerClient.query(
        `CREATE DATABASE ${quoteIdentifier(cfg.dbName)} OWNER ${quoteIdentifier(cfg.appDbUser)}`
      );
    }

    await installerClient.query(
      `GRANT ALL PRIVILEGES ON DATABASE ${quoteIdentifier(cfg.dbName)} TO ${quoteIdentifier(cfg.appDbUser)}`
    );
  } finally {
    await installerClient.end();
  }
}

async function ensureSchemaPrivileges(cfg) {
  const targetClient = new Client({
    host: cfg.dbHost,
    port: cfg.dbPort,
    user: cfg.appDbUser,
    password: cfg.appDbPassword,
    database: cfg.dbName,
  });

  await targetClient.connect();
  try {
    await targetClient.query("CREATE SCHEMA IF NOT EXISTS showdeal AUTHORIZATION CURRENT_USER");
  } finally {
    await targetClient.end();
  }
}

async function applyPrismaSchema(databaseUrl) {
  await execFileAsync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "db", "push", "--accept-data-loss", "--skip-generate"],
    {
      cwd: APP_ROOT,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      maxBuffer: 1024 * 1024 * 10,
    }
  );
}

async function seedInitialData(databaseUrl, cfg) {
  const seedPrisma = new (require("@prisma/client").PrismaClient)({
    datasources: {
      db: { url: databaseUrl },
    },
    log: ["error"],
  });

  try {
    await seedPrisma.$transaction(async (tx) => {
      const existingUser = await tx.r_user.findFirst({
        where: { user_1: cfg.adminUser },
        select: { id_user: true },
      });

      if (existingUser) {
        const err = new Error("ADMIN_USER_ALREADY_EXISTS");
        err.status = 409;
        throw err;
      }

      let role = await tx.r_role.findFirst({
        where: { role: "ADMIN" },
      });

      if (!role) {
        role = await tx.r_role.create({
          data: {
            role: "ADMIN",
            is_active: true,
            additional: { is_admin: true, setup_bootstrap: true },
          },
        });
      } else if (role.is_active !== true || role.additional?.is_admin !== true) {
        role = await tx.r_role.update({
          where: { id_role: role.id_role },
          data: {
            is_active: true,
            additional: {
              ...(role.additional && typeof role.additional === "object" ? role.additional : {}),
              is_admin: true,
              setup_bootstrap: true,
            },
          },
        });
      }

      const company = await tx.r_company.create({
        data: {
          uin: buildUin("CMP"),
          company: cfg.companyName,
          is_active: true,
          additional: { setup_bootstrap: true },
        },
      });

      const passwordHash = await bcrypt.hash(cfg.adminPassword, 12);

      await tx.r_user.create({
        data: {
          id_company: company.id_company,
          id_role: role.id_role,
          uin: buildUin("USR"),
          user_1: cfg.adminUser,
          name: cfg.adminName,
          is_active: true,
          authentication: [
            {
              password: passwordHash,
              algorithm: "bcrypt",
              created: new Date().toISOString().slice(0, 10),
              expired: null,
            },
          ],
          additional: {
            first_login: false,
            setup_bootstrap: true,
          },
        },
      });
    });
  } finally {
    await seedPrisma.$disconnect();
  }
}

async function bootstrapInitialSetup(input) {
  const cfg = setupSchema.parse(input || {});

  const alreadyConfigured = await isSystemConfigured();
  if (alreadyConfigured) {
    const err = new Error("SYSTEM_ALREADY_CONFIGURED");
    err.status = 409;
    throw err;
  }

  await createDatabaseInfrastructure(cfg);
  await ensureSchemaPrivileges(cfg);

  const databaseUrl = buildDbUrl({
    user: cfg.appDbUser,
    password: cfg.appDbPassword,
    host: cfg.dbHost,
    port: cfg.dbPort,
    dbName: cfg.dbName,
  });

  await applyPrismaSchema(databaseUrl);
  await seedInitialData(databaseUrl, cfg);

  return {
    ok: true,
    status: 201,
    data: {
      configured: true,
      dbName: cfg.dbName,
      dbUser: cfg.appDbUser,
      admin_user: cfg.adminUser,
      company: cfg.companyName,
      databaseUrl,
      requiresAppRestart: true,
    },
  };
}

module.exports = {
  bootstrapInitialSetup,
  isSystemConfigured,
};
