const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const swaggerUi = require("swagger-ui-express");

const healthRouter = require("./routes/health");
const authRouter = require("./auth/auth.routes");
const crudRoutes = require("./routes/crud.routes");
const setupRouter = require("./setup/setup.routes");
const { isSystemConfigured } = require("./setup/setup.service");
const { errorHandler, notFoundHandler } = require("./routes/error.middleware");
const { openApiSpec } = require("./docs/openapi");
const { requireAuth } = require("./auth/auth.middleware");

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isLocalDevIp(ip) {
  return [
    "::1",
    "127.0.0.1",
    "::ffff:127.0.0.1",
    "172.18.0.1",
  ].includes(String(ip || ""));
}

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function parseAllowedOrigins(value) {
  return String(value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function createApp() {
  const app = express();

  // Ensure req.ip reflects the real client IP when running behind a reverse proxy.
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', process.env.TRUST_PROXY);
  } else if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  app.use(
    helmet({
      hsts: isEnabled(process.env.ENABLE_HSTS),
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "upgrade-insecure-requests": null,
          "img-src": ["'self'", "data:", "blob:"],
          "frame-src": ["'self'", "blob:"],
          // Strict script policy: no 'unsafe-inline'. The Swagger UI route
          // applies its own relaxed CSP locally (see /api-docs below).
        },
      },
    })
  );
  
  // ✅ RATE LIMITING GLOBAL (Security: prevent DoS)
  const isProdEnv = process.env.NODE_ENV === "production";
  const limiter = rateLimit({
    windowMs: parsePositiveInt(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: parsePositiveInt(process.env.GLOBAL_RATE_LIMIT_MAX, isProdEnv ? 300 : 5000),
    message: {
      ok: false,
      error: "Too many requests from this IP, please try again later."
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
      process.env.NODE_ENV === "test" ||
      (!isProdEnv && isLocalDevIp(req.ip)),
  });
  app.use(limiter);
  
  // ✅ CORS WHITELIST (Security: prevent CSRF) - REMOVED null origin
  // CORS is environment-owned. Production origins must never be baked into code.
  const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
  if (process.env.NODE_ENV !== "production" && allowedOrigins.length === 0) {
    allowedOrigins.push(
      "http://localhost:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001"
    );
  }
  
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests without Origin header (same-site navigation, server-to-server clients).
      if (!origin) {
        return callback(null, true);
      }
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        const err = new Error(`CORS not allowed: ${origin}`);
        err.status = 403;
        callback(err);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
  }));

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  
  // ✅ COOKIE PARSER (Required by csurf for CSRF protection)
  app.use(cookieParser());

  // ── API documentation (OpenAPI 3.0 / Swagger UI) ─────────────────────────
  // Disabled by default in production. Enable explicitly with ENABLE_API_DOCS=true,
  // in which case the docs require an authenticated admin session.
  const docsEnabled =
    process.env.NODE_ENV !== "production" ||
    String(process.env.ENABLE_API_DOCS).toLowerCase() === "true";

  if (docsEnabled) {
    const docsGuards = [];
    if (process.env.NODE_ENV === "production") {
      docsGuards.push(requireAuth, (req, res, next) => {
        if (req.auth?.isAdmin === true) return next();
        return res.status(403).json({ ok: false, error: "FORBIDDEN" });
      });
    }

    // Swagger UI needs inline scripts/styles; scope that relaxation to this route only.
    const docsCsp = helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "script-src": ["'self'", "'unsafe-inline'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:", "blob:"],
        },
      },
    });

    app.get("/api-docs.json", ...docsGuards, (req, res) => {
      res.json(openApiSpec);
    });
    app.use(
      "/api-docs",
      ...docsGuards,
      docsCsp,
      swaggerUi.serve,
      swaggerUi.setup(openApiSpec, { customSiteTitle: "ShowDeal API Docs" })
    );
  }

  app.get("/", async (req, res, next) => {
    try {
      const configured = await isSystemConfigured();
      const page = configured ? "index.html" : "setup.html";
      return res.sendFile(path.join(__dirname, "..", "public", page));
    } catch (error) {
      return next(error);
    }
  });

  // Frontend estático (después de helmet)
  app.use(express.static(path.join(__dirname, "..", "public")));

  const apiCsrfProtection = (req, res, next) => {
    const method = String(req.method || "").toUpperCase();
    const needsCsrf = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
    if (!needsCsrf || process.env.NODE_ENV === "test") return next();

    const csrfCookie = req.cookies?.sd_csrf;
    const csrfHeader = req.get("x-csrf-token");
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      return res.status(403).json({ ok: false, error: "CSRF_TOKEN_INVALID" });
    }

    return next();
  };

  app.use("/health", healthRouter);
  app.use("/setup-api", setupRouter);
  app.use("/auth", authRouter);
  app.use("/api", apiCsrfProtection, crudRoutes);

  // ERROR HANDLER (JSON) - Security Enhanced
  app.use(errorHandler);

  // 404 HANDLER - Security Enhanced
  app.use(notFoundHandler);

  return app;
}



module.exports = { createApp };

