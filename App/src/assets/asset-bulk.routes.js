// src/assets/asset-bulk.routes.js
//
// Bulk import of assets (r_asset) from an Excel (.xlsx / .xls) file.
//
// Endpoint:
//   POST /api/r_asset/bulk-upload   (multipart/form-data, field "file")
//
// Required columns (case-insensitive, accents ignored):
//   placa, ciudad, direccion, marca, modelo, anio
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
//   - Optional "mode" form field: "create" (default) or "upsert" (update by placa/uin).
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

const REQUIRED_COLUMNS = ["placa", "ciudad", "direccion", "marca", "modelo", "anio"];
const NUMERIC_COLUMNS = [
  "book_value",
  "appraised_value",
  "expected_value",
  "reserve_price",
  "starting_bid",
  "realized_value",
];
const OPTIONAL_COLUMNS = [...NUMERIC_COLUMNS, "is_active"];
const SUPPORTED_EXTRA_COLUMNS = ["status", "location_city", "location_address"];
const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...SUPPORTED_EXTRA_COLUMNS, ...OPTIONAL_COLUMNS];

const HEADER_ALIASES = {
  placa: "placa",
  ciudad: "ciudad",
  city: "ciudad",
  location_city: "ciudad",
  direccion: "direccion",
  address: "direccion",
  location_address: "direccion",
  marca: "marca",
  brand: "marca",
  modelo: "modelo",
  model: "modelo",
  anio: "anio",
  ano: "anio",
  year: "anio",
  valor_adjudicacion: "realized_value",
  valor_adjudicación: "realized_value",
  valoradjudicacion: "realized_value",
  status: "status",
  is_active: "is_active",
  book_value: "book_value",
  appraised_value: "appraised_value",
  expected_value: "expected_value",
  reserve_price: "reserve_price",
  starting_bid: "starting_bid",
  realized_value: "realized_value",
};

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

function normalizePlate(raw) {
  return String(raw ?? "").trim().toUpperCase();
}

function parseVehicleYear(raw) {
  const value = Number.parseInt(String(raw ?? "").trim(), 10);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(value) || value < 1900 || value > currentYear + 1) {
    throw new Error("INVALID_VEHICLE_YEAR");
  }
  return value;
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
        const canonicalName = HEADER_ALIASES[name] || name;
        if (canonicalName && ALL_COLUMNS.includes(canonicalName) && !headerMap.has(canonicalName)) {
          headerMap.set(canonicalName, colIdx);
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

          const placa = normalizePlate(data.placa);
          const ciudad = String(data.ciudad || "").trim();
          const direccion = String(data.direccion || "").trim();
          const marca = String(data.marca || "").trim();
          const modelo = String(data.modelo || "").trim();
          const anio = parseVehicleYear(data.anio);

          if (!placa) throw new Error("MISSING_VALUE:placa");
          if (!ciudad) throw new Error("MISSING_VALUE:ciudad");
          if (!direccion) throw new Error("MISSING_VALUE:direccion");
          if (!marca) throw new Error("MISSING_VALUE:marca");
          if (!modelo) throw new Error("MISSING_VALUE:modelo");

          const vehicleData = {
            uin: placa,
            tp_asset: "VEHICLE",
            status: String(data.status || "AVAILABLE").trim().toUpperCase(),
            location_city: ciudad,
            location_address: direccion,
            additional: {
              placa,
              plate: placa,
              ciudad,
              city: ciudad,
              direccion,
              address: direccion,
              marca,
              brand: marca,
              modelo,
              model: modelo,
              anio,
              year: anio,
            },
          };

          for (const col of NUMERIC_COLUMNS) {
            if (data[col] !== undefined) vehicleData[col] = data[col];
          }
          if (data.is_active !== undefined) vehicleData.is_active = data.is_active;

          let saved;
          if (mode === "upsert") {
            const existing = await prisma.r_asset.findFirst({
              where: { uin: placa },
              select: { id_asset: true },
            });
            if (existing) {
              saved = await prisma.r_asset.update({
                where: { id_asset: existing.id_asset },
                data: vehicleData,
              });
            } else {
              saved = await prisma.r_asset.create({ data: vehicleData });
            }
          } else {
            saved = await prisma.r_asset.create({ data: vehicleData });
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
      ws.addRow(["placa", "ciudad", "direccion", "Marca", "Modelo", "Año", "valor adjudicación"]);
      ws.addRow([
        "ABC123",
        "Bogotá",
        "Calle 100 #10-20",
        "Toyota",
        "Corolla",
        "2022",
        "0.00",
      ]);
      const buffer = await wb.xlsx.writeBuffer();
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");
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
