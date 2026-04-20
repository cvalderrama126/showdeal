const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");

const healthRouter = require("./routes/health");
const authRouter = require("./auth/auth.routes");
const crudRoutes = require("./routes/crud.routes");
const { errorHandler, notFoundHandler } = require("./routes/error.middleware");

function createApp() {
  const app = express();
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy === "true") app.set("trust proxy", true);
  else if (trustProxy === "false") app.set("trust proxy", false);
  else if (trustProxy && /^\d+$/.test(trustProxy)) app.set("trust proxy", Number.parseInt(trustProxy, 10));
  else app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "img-src": ["'self'", "data:", "blob:"],
          "frame-src": ["'self'", "blob:"],
        },
      },
    })
  );
  
  // ✅ RATE LIMITING GLOBAL (Security: prevent DoS)
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      ok: false,
      error: "Too many requests from this IP, please try again later."
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
      process.env.NODE_ENV === "test" ||
      (process.env.NODE_ENV !== "production" && (req.ip === "::1" || req.ip === "127.0.0.1" || req.ip === "::ffff:127.0.0.1")),
  });
  app.use(limiter);
  
  // ✅ CORS WHITELIST (Security: prevent CSRF) - REMOVED null origin
  const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
  ];
  if (process.env.NODE_ENV === "production") {
    allowedOrigins.push("https://showdeal.com", "https://www.showdeal.com");
  }
  
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS not allowed: ${origin}`));
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

  // Frontend estático (después de helmet)
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.use("/health", healthRouter);
  app.use("/auth", authRouter);
  app.use("/api", crudRoutes);

  // ERROR HANDLER (JSON) - Security Enhanced
  app.use(errorHandler);

  // 404 HANDLER - Security Enhanced
  app.use(notFoundHandler);

  return app;
}



module.exports = { createApp };
