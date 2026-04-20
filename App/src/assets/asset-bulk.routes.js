// src/assets/asset-bulk.routes.js
//
// Bulk import of assets (r_asset) from an Excel (.xlsx / .xls) file.
//
// Endpoint:
//   POST /api/r_asset/bulk-upload   (multipart/form-data, field "file")
//
// Required columns (case-insensitive, accents ignored):
//   uin, tp_asset, status, location_city, location_address
//
// Optional columns:
//   book_value, appraised_value, expected_value,
//   reserve_price, starting_bid, realized_value,
//   is_active
//
// Behaviour:
//   - Validates required columns are present (rejects file otherwise).
//   - Iterates rows individually; failures on one row never stop the rest.
//   - Returns a per-row report: { row, ok, id_asset?, error?, uin? }.
//   - Optional "mode" form field: "create" (default) or "upsert" (update by uin).
//   - Records an aggregated audit log entry for the whole import.

const path = require("path");
const router = require("express").Router();
const multer = require("multer");
const ExcelJS = require("exceljs");
const { fileTypeFromBuffer } = require("file-type");

const { requireAuth } = require("../auth/auth.middleware");
const { requireModuleAccess } = require("../routes/access.guard");
const { prisma } = require("../db/prisma");
const { jsonSafe } = require("../routes/jsonSafe");
const { audit } = require("../utils/audit.service");

const REQUIRED_COLUMNS = ["uin", "tp_asset", "status", "location_city", "location_address"];
const NUMERIC_COLUMNS = [
  "book_value",
  "appraised_value",
  "expected_value",
  "reserve_price",
  "starting_bid",
  "realized_value",
];
const OPTIONAL_COLUMNS = [...NUMERIC_COLUMNS, "is_active"];
const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

const MAX_ROWS = Number.parseInt(process.env.ASSET_BULK_MAX_ROWS || "5000", 10);

const ALLOWED_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
  "application/vnd.ms-excel",                                          // xls
  "application/octet-stream", // some browsers send this; we re-check via magic bytes
]);
const ALLOWED_EXT = new Set(["xlsx", "xls"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      const err = new Error("FILE_TYPE_NOT_ALLOWED");
      err.status = 400;
      return cb(err);
    }
    const ext = (file.originalname || "").split(".").pop().toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      const err = new Error("FILE_EXTENSION_NOT_ALLOWED");
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

function normalizeColumnName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function cellToString(cell) {
  if (cell === null || cell === undefined) return "";
  const value = cell.value !== undefined ? cell.value : cell;
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    if (value.text) return String(value.text).trim();
    if (value.result !== undefined && value.result !== null) return String(value.result).trim();
    if (Array.isArray(value.richText)) return value.richText.map((r) => r.text).join("").trim();
  }
  return String(value).trim();
}

function parseDecimal(raw) {
  const text = String(raw ?? "").replace(/,/g, ".").trim();
  if (!text) return "0.00";
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("INVALID_NUMERIC_VALUE");
  }
  return parsed.toFixed(2);
}

function parseBoolean(raw) {
  const text = String(raw ?? "").trim().toLowerCase();
  if (!text) return true;
  if (["1", "true", "si", "sí", "yes", "y", "x"].includes(text)) return true;
  if (["0", "false", "no", "n"].includes(text)) return false;
  throw new Error("INVALID_BOOLEAN_VALUE");
}

router.post(
  "/bulk-upload",
  requireAuth,
  requireModuleAccess("r_asset", "create"),
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ ok: false, error: "FILE_REQUIRED" });
      }

      // Magic-byte validation. xlsx is a ZIP container; xls is OLE compound file.
      const detected = await fileTypeFromBuffer(req.file.buffer).catch(() => null);
      if (detected && !ALLOWED_MIME.has(detected.mime)) {
        return res.status(400).json({
          ok: false,
          error: "FILE_CONTENT_TYPE_MISMATCH",
          detected: detected.mime,
        });
      }

      const mode = String(req.body?.mode || "create").toLowerCase();
      if (!["create", "upsert"].includes(mode)) {
        return res.status(400).json({ ok: false, error: "INVALID_MODE" });
      }

      const workbook = new ExcelJS.Workbook();
      try {
        await workbook.xlsx.load(req.file.buffer);
      } catch (err) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_EXCEL_FILE",
          message: err.message,
        });
      }

      const sheet = workbook.worksheets[0];
      if (!sheet) {
        return res.status(400).json({ ok: false, error: "EMPTY_WORKBOOK" });
      }

      const headerRow = sheet.getRow(1);
      const headerMap = new Map(); // normalized name -> column index (1-based)
      headerRow.eachCell((cell, colIdx) => {
        const name = normalizeColumnName(cellToString(cell));
        if (name && ALL_COLUMNS.includes(name) && !headerMap.has(name)) {
          headerMap.set(name, colIdx);
        }
      });

      const missing = REQUIRED_COLUMNS.filter((c) => !headerMap.has(c));
      if (missing.length) {
        return res.status(400).json({
          ok: false,
          error: "MISSING_REQUIRED_COLUMNS",
          missing,
          required: REQUIRED_COLUMNS,
          optional: OPTIONAL_COLUMNS,
        });
      }

      const totalRows = Math.max(0, sheet.rowCount - 1);
      if (totalRows === 0) {
        return res.status(400).json({ ok: false, error: "NO_DATA_ROWS" });
      }
      if (totalRows > MAX_ROWS) {
        return res.status(400).json({
          ok: false,
          error: "TOO_MANY_ROWS",
          maxRows: MAX_ROWS,
          received: totalRows,
        });
      }

      const results = [];
      let success = 0;
      let failed = 0;

      // Process row by row. Each row uses its own try/catch so a single bad
      // row never aborts the whole upload.
      for (let r = 2; r <= sheet.rowCount; r += 1) {
        const row = sheet.getRow(r);
        const hasAnyCell = ALL_COLUMNS.some((col) => {
          const idx = headerMap.get(col);
          if (!idx) return false;
          return cellToString(row.getCell(idx)).length > 0;
        });
        if (!hasAnyCell) continue;

        try {
          const data = {};
          for (const col of REQUIRED_COLUMNS) {
            const value = cellToString(row.getCell(headerMap.get(col)));
            if (!value) {
              throw new Error(`MISSING_VALUE:${col}`);
            }
            data[col] = value;
          }
          for (const col of NUMERIC_COLUMNS) {
            if (headerMap.has(col)) {
              const raw = cellToString(row.getCell(headerMap.get(col)));
              try {
                data[col] = parseDecimal(raw);
              } catch {
                throw new Error(`INVALID_NUMERIC:${col}`);
              }
            }
          }
          if (headerMap.has("is_active")) {
            const raw = cellToString(row.getCell(headerMap.get("is_active")));
            try {
              data.is_active = parseBoolean(raw);
            } catch {
              throw new Error("INVALID_BOOLEAN:is_active");
            }
          }

          let saved;
          if (mode === "upsert") {
            const existing = await prisma.r_asset.findFirst({
              where: { uin: data.uin },
              select: { id_asset: true },
            });
            if (existing) {
              saved = await prisma.r_asset.update({
                where: { id_asset: existing.id_asset },
                data,
              });
            } else {
              saved = await prisma.r_asset.create({ data });
            }
          } else {
            saved = await prisma.r_asset.create({ data });
          }

          success += 1;
          results.push({
            row: r,
            ok: true,
            id_asset: saved.id_asset,
            uin: saved.uin,
          });
        } catch (err) {
          failed += 1;
          results.push({
            row: r,
            ok: false,
            error: err?.code || err?.message || "ROW_FAILED",
          });
        }
      }

      audit({
        req,
        action: "ASSET_BULK_IMPORT",
        entity: "r_asset",
        data: {
          file: path.basename(req.file.originalname || ""),
          mode,
          totalRows,
          success,
          failed,
        },
      });

      const status = failed === 0 ? 201 : 207; // 207 Multi-Status when partial
      return res.status(status).json(
        jsonSafe({
          ok: failed === 0,
          summary: { totalRows, success, failed, mode },
          results,
        })
      );
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/r_asset/bulk-template
// Provides a downloadable .xlsx template with the expected columns so end-users
// know exactly which fields are required.
router.get(
  "/bulk-template",
  requireAuth,
  requireModuleAccess("r_asset", "read"),
  async (req, res, next) => {
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("assets");
      ws.addRow(ALL_COLUMNS);
      ws.addRow([
        "UIN-001",
        "VEHICLE",
        "AVAILABLE",
        "Bogotá",
        "Calle 100 #10-20",
        "0.00",
        "0.00",
        "0.00",
        "0.00",
        "0.00",
        "0.00",
        "true",
      ]);
      const buffer = await wb.xlsx.writeBuffer();
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="r_asset_bulk_template.xlsx"'
      );
      return res.send(Buffer.from(buffer));
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
