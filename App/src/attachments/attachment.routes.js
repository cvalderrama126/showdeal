const multer = require("multer");
const { fileTypeFromBuffer } = require("file-type");
const router = require("express").Router();
const { requireAuth } = require("../auth/auth.middleware");
const { jsonSafe } = require("../routes/jsonSafe");
const { requireModuleAccess } = require("../routes/access.guard");
const {
  createAttachment,
  deleteAttachment,
  getAttachmentById,
  getAttachmentDownload,
  listAttachmentOptions,
  listAttachments,
  updateAttachment,
} = require("./attachment.service");

function parseInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (Number.isNaN(parsed)) return fallback;
  if (parsed < min) return fallback;
  return Math.min(parsed, max);
}

function toId(idParam) {
  const text = String(idParam || "").trim();
  if (!/^\d+$/.test(text)) {
    const err = new Error("INVALID_ID");
    err.status = 400;
    throw err;
  }
  return BigInt(text);
}

// ✅ ALLOWED MIME TYPES (Security: file upload validation)
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// ✅ ALLOWED FILE EXTENSIONS (Additional security layer)
const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "jpg", "jpeg",
  "png",
  "gif",
  "txt",
  "csv",
  "xlsx", "xls",
  "doc", "docx",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInteger(process.env.ATTACH_MAX_SIZE_BYTES, 10 * 1024 * 1024, {
      min: 1024,
      max: 50 * 1024 * 1024,
    }),
  },
  fileFilter: async (req, file, callback) => {
    try {
      // ✅ VALIDATE MIME TYPE FROM HEADER
      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        const err = new Error("FILE_TYPE_NOT_ALLOWED");
        err.status = 400;
        err.meta = { allowed: Array.from(ALLOWED_MIME_TYPES) };
        return callback(err);
      }

      // ✅ VALIDATE FILE EXTENSION
      const fileName = file.originalname || "";
      const extension = fileName.split('.').pop()?.toLowerCase();
      if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
        const err = new Error("FILE_EXTENSION_NOT_ALLOWED");
        err.status = 400;
        err.meta = { allowed: Array.from(ALLOWED_EXTENSIONS) };
        return callback(err);
      }

      // ✅ VALIDATE FILE CONTENT (Magic Bytes) - Only for non-empty files
      if (file.size > 0 && file.buffer) {
        const detectedType = await fileTypeFromBuffer(file.buffer);
        if (!detectedType) {
          // Unknown file type - reject
          const err = new Error("FILE_CONTENT_UNRECOGNIZED");
          err.status = 400;
          return callback(err);
        }

        // Verify detected MIME type matches allowed types
        if (!ALLOWED_MIME_TYPES.has(detectedType.mime)) {
          const err = new Error("FILE_CONTENT_TYPE_MISMATCH");
          err.status = 400;
          err.meta = {
            detected: detectedType.mime,
            allowed: Array.from(ALLOWED_MIME_TYPES)
          };
          return callback(err);
        }

        // Additional check: extension should match detected type
        const expectedExt = getExtensionFromMime(detectedType.mime);
        if (expectedExt && extension !== expectedExt) {
          const err = new Error("FILE_EXTENSION_MISMATCH");
          err.status = 400;
          err.meta = {
            expected: expectedExt,
            provided: extension
          };
          return callback(err);
        }
      }

      callback(null, true);
    } catch (error) {
      const err = new Error("FILE_VALIDATION_ERROR");
      err.status = 400;
      err.meta = { originalError: error.message };
      callback(err);
    }
  },
});

// Helper function to get expected extension from MIME type
function getExtensionFromMime(mimeType) {
  const mimeToExt = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-excel': 'xls',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  };
  return mimeToExt[mimeType];
}

function handleSingleUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();

    if (err.code === "LIMIT_FILE_SIZE") {
      err.status = 400;
      err.message = "FILE_TOO_LARGE";
      err.meta = {
        maxBytes: parseInteger(process.env.ATTACH_MAX_SIZE_BYTES, 10 * 1024 * 1024),
      };
    } else if (err.message === "FILE_TYPE_NOT_ALLOWED") {
      err.status = 400;
    } else if (err.message === "FILE_EXTENSION_NOT_ALLOWED") {
      err.status = 400;
    } else if (err.message === "FILE_CONTENT_UNRECOGNIZED") {
      err.status = 400;
    } else if (err.message === "FILE_CONTENT_TYPE_MISMATCH") {
      err.status = 400;
    } else if (err.message === "FILE_EXTENSION_MISMATCH") {
      err.status = 400;
    } else if (err.message === "FILE_VALIDATION_ERROR") {
      err.status = 400;
    } else {
      err.status = err.status || 400;
    }

    return next(err);
  });
}

function contentDispositionFileName(fileName, fallbackName) {
  const raw = String(fileName || fallbackName || "adjunto.bin");
  return raw.replace(/["\r\n]/g, "_");
}

router.use(requireAuth);

router.get("/meta/options", requireModuleAccess("r_attach", "read"), async (req, res, next) => {
  try {
    const data = await listAttachmentOptions();
    return res.json(jsonSafe({ ok: true, data }));
  } catch (err) {
    return next(err);
  }
});

router.get("/", requireModuleAccess("r_attach", "read"), async (req, res, next) => {
  try {
    const take = parseInteger(req.query.take, 25, { min: 1, max: 200 });
    const skip = parseInteger(req.query.skip, 0, { min: 0, max: 100000 });
    const includeInactive = req.query.includeInactive === "true";

    const result = await listAttachments({
      take,
      skip,
      includeInactive,
      q: req.query.q,
      id_asset: req.query.id_asset,
      tp_attach: req.query.tp_attach,
    });

    return res.json(jsonSafe({ ok: true, data: result.rows, meta: result.meta }));
  } catch (err) {
    return next(err);
  }
});

router.get("/:id/download", requireModuleAccess("r_attach", "read"), async (req, res, next) => {
  try {
    const id_attach = toId(req.params.id);
    const includeInactive = req.query.includeInactive === "true";
    const file = await getAttachmentDownload(id_attach, { includeInactive });

    if (!file) {
      return res.status(404).json({ ok: false, error: "ATTACHMENT_NOT_FOUND" });
    }

    // ✅ SECURITY: Additional validation for file content
    if (!file.file_content || file.file_content.length === 0) {
      return res.status(404).json({ ok: false, error: "ATTACHMENT_FILE_NOT_FOUND" });
    }

    const fileName = contentDispositionFileName(file.file_name, `attachment-${id_attach}.bin`);
    res.setHeader("Content-Type", file.mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", String(file.file_content.length));

    // ✅ SECURITY: Prevent caching of sensitive files
    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    return res.send(file.file_content);
  } catch (err) {
    return next(err);
  }
});

router.get("/:id", requireModuleAccess("r_attach", "read"), async (req, res, next) => {
  try {
    const id_attach = toId(req.params.id);
    const includeInactive = req.query.includeInactive === "true";
    const data = await getAttachmentById(id_attach, { includeInactive });

    if (!data) {
      return res.status(404).json({ ok: false, error: "ATTACHMENT_NOT_FOUND" });
    }

    return res.json(jsonSafe({ ok: true, data }));
  } catch (err) {
    return next(err);
  }
});

router.post(
  "/",
  requireModuleAccess("r_attach", "create"),
  handleSingleUpload,
  async (req, res, next) => {
    try {
      const data = await createAttachment(req.body || {}, req.file);
      return res.status(201).json(jsonSafe({ ok: true, data }));
    } catch (err) {
      return next(err);
    }
  }
);

router.put(
  "/:id",
  requireModuleAccess("r_attach", "update"),
  handleSingleUpload,
  async (req, res, next) => {
    try {
      const id_attach = toId(req.params.id);
      const data = await updateAttachment(id_attach, req.body || {}, req.file);
      return res.json(jsonSafe({ ok: true, data }));
    } catch (err) {
      return next(err);
    }
  }
);

router.delete("/:id", requireModuleAccess("r_attach", "delete"), async (req, res, next) => {
  try {
    const id_attach = toId(req.params.id);
    const data = await deleteAttachment(id_attach);
    return res.json(jsonSafe({ ok: true, data }));
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
