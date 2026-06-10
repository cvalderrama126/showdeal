/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE_FILE = path.join(ROOT, ".env.docker");
const DEFAULT_ENV_FILE = path.join(ROOT, ".env.production");

function run(command, args, { cwd = ROOT, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  if (!allowFailure && result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }

  return result.status || 0;
}

function parseEnvText(text) {
  const lines = text.split(/\r?\n/);
  const env = {};

  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    env[key] = value;
  }

  return env;
}

function replaceEnvValue(content, key, value) {
  const rx = new RegExp(`^${key}=.*$`, "m");
  if (rx.test(content)) {
    return content.replace(rx, `${key}=${value}`);
  }
  return `${content.trimEnd()}\n${key}=${value}\n`;
}

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question, defaultValue = "") {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      const text = String(answer || "").trim();
      resolve(text || defaultValue);
    });
  });
}

function strongSecret() {
  return crypto.randomBytes(48).toString("base64url");
}

async function buildEnvFile(targetEnvFile) {
  const template = fs.readFileSync(TEMPLATE_FILE, "utf8");
  const base = fs.existsSync(targetEnvFile) ? fs.readFileSync(targetEnvFile, "utf8") : template;
  const current = parseEnvText(base);

  const rl = createInterface();

  try {
    console.log("\nShowDeal Production Wizard\n");
    console.log("This wizard will create/update your production env file and deploy with Docker.\n");

    const appBaseUrl = await ask(rl, "App base URL (public)", current.APP_BASE_URL || "https://your-domain.com");
    const appPort = await ask(rl, "App port on host", current.APP_PORT || "3000");
    const dbUser = await ask(rl, "DB user", current.DB_USER || "showdeal");
    const dbName = await ask(rl, "DB name", current.DB_NAME || "showdeal");
    const dbPassword = await ask(rl, "DB password", current.DB_PASSWORD || "");
    const redisPassword = await ask(rl, "Redis password", current.REDIS_PASSWORD || "");

    const adminEmail = await ask(rl, "Initial admin email", current.ADMIN_EMAIL || "admin@showdeal.com");
    const adminName = await ask(rl, "Initial admin full name", current.ADMIN_FULL_NAME || "Admin User");
    const adminPhone = await ask(rl, "Initial admin phone", current.ADMIN_PHONE || "+1-555-0000");

    const adminPassword = await ask(rl, "Initial admin password (plain text; will be hashed)", "");

    const smtpHost = await ask(rl, "SMTP host (leave empty to disable reset emails)", current.SMTP_HOST || "");
    const smtpPort = await ask(rl, "SMTP port", current.SMTP_PORT || "587");
    const smtpUser = await ask(rl, "SMTP user", current.SMTP_USER || "");
    const smtpPass = await ask(rl, "SMTP password", current.SMTP_PASS || "");
    const smtpFrom = await ask(rl, "SMTP from", current.SMTP_FROM || smtpUser || "");
    const smtpSecure = await ask(rl, "SMTP secure (true/false)", current.SMTP_SECURE || "false");

    const jwtSecret = strongSecret();
    const jwtChallengeSecret = strongSecret();

    const adminPasswordHash = adminPassword
      ? await bcrypt.hash(adminPassword, 10)
      : (current.ADMIN_PASSWORD_HASH || "");

    let output = base;
    output = replaceEnvValue(output, "NODE_ENV", "production");
    output = replaceEnvValue(output, "APP_BASE_URL", appBaseUrl);
    output = replaceEnvValue(output, "APP_PORT", appPort);
    output = replaceEnvValue(output, "DB_USER", dbUser);
    output = replaceEnvValue(output, "DB_NAME", dbName);
    output = replaceEnvValue(output, "DB_PASSWORD", dbPassword);
    output = replaceEnvValue(output, "REDIS_PASSWORD", redisPassword);
    output = replaceEnvValue(output, "ADMIN_EMAIL", adminEmail);
    output = replaceEnvValue(output, "ADMIN_FULL_NAME", adminName);
    output = replaceEnvValue(output, "ADMIN_PHONE", adminPhone);
    output = replaceEnvValue(output, "ADMIN_PASSWORD_HASH", adminPasswordHash);
    output = replaceEnvValue(output, "JWT_SECRET", jwtSecret);
    output = replaceEnvValue(output, "JWT_CHALLENGE_SECRET", jwtChallengeSecret);
    output = replaceEnvValue(output, "ALLOW_LEGACY_SHA256_LOGIN", "0");

    output = replaceEnvValue(output, "SMTP_HOST", smtpHost);
    output = replaceEnvValue(output, "SMTP_PORT", smtpPort);
    output = replaceEnvValue(output, "SMTP_USER", smtpUser);
    output = replaceEnvValue(output, "SMTP_PASS", smtpPass);
    output = replaceEnvValue(output, "SMTP_FROM", smtpFrom);
    output = replaceEnvValue(output, "SMTP_SECURE", smtpSecure);

    const required = [
      ["DB_PASSWORD", dbPassword],
      ["REDIS_PASSWORD", redisPassword],
      ["ADMIN_PASSWORD_HASH", adminPasswordHash],
      ["JWT_SECRET", jwtSecret],
      ["JWT_CHALLENGE_SECRET", jwtChallengeSecret],
    ];

    const missing = required.filter(([, value]) => !String(value || "").trim()).map(([key]) => key);
    if (missing.length) {
      throw new Error(`Missing required values: ${missing.join(", ")}`);
    }

    fs.writeFileSync(targetEnvFile, output, "utf8");
    console.log(`\n[OK] Env file written: ${targetEnvFile}`);

    return {
      appPort,
      appBaseUrl,
      envFile: targetEnvFile,
    };
  } finally {
    rl.close();
  }
}

async function waitForHealth(appPort, timeoutMs = 120000) {
  const started = Date.now();
  const healthUrl = `http://127.0.0.1:${appPort}/health`;

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        console.log(`[OK] Health is up: ${healthUrl}`);
        return;
      }
    } catch {
      // Retry until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  throw new Error("Health check timeout. App did not become healthy in time.");
}

async function main() {
  const envFile = process.argv[2]
    ? path.resolve(process.argv[2])
    : DEFAULT_ENV_FILE;

  console.log("\nStep 1/4 - Build production env file");
  const info = await buildEnvFile(envFile);

  console.log("\nStep 2/4 - Build and start containers");
  run("docker", ["compose", "--env-file", info.envFile, "up", "-d", "--build"]);

  console.log("\nStep 3/4 - Wait for app health");
  await waitForHealth(info.appPort);

  console.log("\nStep 4/4 - Run quick smoke check");
  run("node", ["-e", `fetch('http://127.0.0.1:${info.appPort}/health').then(r=>r.text()).then(t=>console.log(t)).catch(e=>{console.error(e.message);process.exit(1);})`]);

  console.log("\nDeployment wizard completed successfully.");
  console.log(`Base URL configured: ${info.appBaseUrl}`);
}

main().catch((error) => {
  console.error(`\n[ERROR] ${error.message}`);
  process.exit(1);
});
