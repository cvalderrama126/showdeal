const router = require("express").Router();
const multer = require("multer");
const ExcelJS = require("exceljs");
const { createCrudRouter } = require("./crud.factory");
const { requireAuth } = require("../auth/auth.middleware");
const { requireModuleAccess } = require("./access.guard");
const { prisma } = require("../db/prisma");
const { jsonSafe } = require("./jsonSafe");
const { audit } = require("../utils/audit.service");
const attachmentRoutes = require("../attachments/attachment.routes");
const userRoutes = require("../users/user.routes");
const assetBulkRoutes = require("../assets/asset-bulk.routes");

const round1OfferUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});

function toBigIntId(value) {
  const text = String(value || "").trim();
  if (!/^\d+$/.test(text)) return null;
  const id = BigInt(text);
  if (id <= 0n) return null;
  return id;
}

function toPositiveDecimal(value) {
  const text = String(value ?? "").trim();
  if (!text || Number.isNaN(Number(text))) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed.toFixed(2);
}

function toPositiveInteger(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizeColumnName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function excelCellToString(cell) {
  if (!cell) return "";
  const value = cell.value !== undefined ? cell.value : cell;
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    if (value.text) return String(value.text).trim();
    if (value.result !== undefined && value.result !== null) return String(value.result).trim();
    if (Array.isArray(value.richText)) return value.richText.map((item) => item.text).join("").trim();
  }
  return String(value).trim();
}

function normalizePlate(value) {
  return String(value || "").trim().toUpperCase();
}

function jsonClone(value) {
  return value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : {};
}

function getStringFromAdditional(additional, keys = []) {
  if (!additional || typeof additional !== "object") return null;
  for (const key of keys) {
    const value = additional[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function resolveEventStatus(event) {
  if (!event) return "NO_EVENT";
  if (event.is_active !== true) return "INACTIVE";

  const now = Date.now();
  const startAt = new Date(event.start_at || 0).getTime();
  const endAt = new Date(event.end_at || 0).getTime();

  if (Number.isFinite(startAt) && now < startAt) return "SCHEDULED";
  if (Number.isFinite(endAt) && now > endAt) return "FINISHED";
  return "LIVE";
}

function normalizeAuctionResolution(auction, bids) {
  const orderedBids = [...(Array.isArray(bids) ? bids : [])].sort((left, right) => {
    const leftValue = Number(left.value || 0);
    const rightValue = Number(right.value || 0);
    if (rightValue !== leftValue) return rightValue - leftValue;

    const leftAt = new Date(left.ins_at || 0).getTime();
    const rightAt = new Date(right.ins_at || 0).getTime();
    if (leftAt !== rightAt) return leftAt - rightAt;

    return Number(left.id_bid || 0) - Number(right.id_bid || 0);
  });

  const winnerBid = orderedBids[0] || null;
  const topValue = winnerBid ? Number(winnerBid.value || 0) : 0;
  const tiedBidCount = topValue > 0
    ? orderedBids.filter((bid) => Number(bid.value || 0) === topValue).length
    : 0;

  const additional = jsonClone(auction?.additional);
  const resolution = additional.resolution && typeof additional.resolution === "object"
    ? additional.resolution
    : null;

  return {
    orderedBids,
    winnerBid,
    topValue: topValue > 0 ? topValue.toFixed(2) : "0.00",
    tiedBidCount,
    rule: "highest_bid_then_earliest_offer",
    resolution,
  };
}

function mapAuctionResolutionRow(auction) {
  const summary = normalizeAuctionResolution(auction, auction?.r_bid || []);
  const winnerUser = summary.winnerBid?.r_user || null;
  const winnerCompany = winnerUser?.r_company?.company || null;
  const resolvedWinner = summary.resolution?.winner && typeof summary.resolution.winner === "object"
    ? summary.resolution.winner
    : null;
  const assetAdditional = jsonClone(auction?.r_asset?.additional);
  const eventAdditional = jsonClone(auction?.r_event?.additional);
  const assetBrand = getStringFromAdditional(assetAdditional, ["brand", "marca", "make"]);
  const assetModel = getStringFromAdditional(assetAdditional, ["model", "modelo"]);
  const eventStatus = resolveEventStatus(auction?.r_event);
  const lotType = String(eventAdditional.lot_type || "").trim().toUpperCase();

  return {
    id_auction: auction.id_auction,
    id_asset: auction.id_asset,
    asset_uin: auction.r_asset?.uin || null,
    asset_type: auction.r_asset?.tp_asset || null,
    asset_brand: assetBrand,
    asset_model: assetModel,
    asset_status: auction.r_asset?.status || null,
    id_event: auction.id_event,
    tp_auction: auction.tp_auction,
    lot_name: eventAdditional.lot_name || null,
    lot_type: lotType || null,
    lot_stage: eventAdditional.lot_stage || null,
    event_type: auction.r_event?.tp_event || null,
    event_status: eventStatus,
    event_start_at: auction.r_event?.start_at || null,
    event_end_at: auction.r_event?.end_at || null,
    is_active: auction.is_active,
    bid_count: summary.orderedBids.length,
    highest_bid: summary.topValue,
    tie_count: summary.tiedBidCount,
    tie_breaker_rule: "Mayor oferta; si hay empate, gana la primera oferta registrada",
    winner_preview: winnerUser ? {
      id_user: winnerUser.id_user,
      user: winnerUser.user_1,
      name: winnerUser.name,
      company_name: winnerCompany,
      value: summary.topValue,
      ins_at: summary.winnerBid.ins_at,
    } : null,
    resolved: !!summary.resolution,
    resolution: summary.resolution,
    winner_company_name: resolvedWinner?.company_name || winnerCompany,
    bids: summary.orderedBids.map((bid) => ({
      id_bid: bid.id_bid,
      id_user: bid.id_user,
      user: bid.r_user?.user_1 || null,
      name: bid.r_user?.name || null,
      company_name: bid.r_user?.r_company?.company || null,
      value: bid.value,
      ins_at: bid.ins_at,
    })),
  };
}

function sanitizeDownloadFileName(fileName, fallback = "archivo.bin") {
  const raw = String(fileName || "").trim();
  const candidate = raw || fallback;
  return candidate.replace(/[\\/:*?"<>|\r\n]+/g, "_");
}

function isBuyerAuth(auth) {
  const roleName = String(auth?.roleName || "").trim().toLowerCase();
  return roleName.includes("buyer") || roleName.includes("comprador");
}

function isAppraisalAttachmentType(tpAttach) {
  return /avalu|apprais/i.test(String(tpAttach || ""));
}

function didUserWinAuction(auction, idUser) {
  const summary = normalizeAuctionResolution(auction, auction?.r_bid || []);
  const additional = jsonClone(auction?.additional);
  const resolutionWinnerId = toBigIntId(additional?.resolution?.winner?.id_user);

  if (resolutionWinnerId) {
    return String(resolutionWinnerId) === String(idUser);
  }

  const fallbackWinner = summary.winnerBid?.id_user ? BigInt(String(summary.winnerBid.id_user)) : null;
  if (!fallbackWinner) return false;
  return String(fallbackWinner) === String(idUser);
}

async function getAuctionWithResolutionContext(idAuction) {
  return prisma.r_auction.findUnique({
    where: { id_auction: idAuction },
    include: {
      r_asset: {
        select: {
          id_asset: true,
          uin: true,
          tp_asset: true,
          status: true,
          realized_value: true,
          additional: true,
        },
      },
      r_event: {
        select: {
          id_event: true,
          tp_event: true,
          start_at: true,
          end_at: true,
          is_active: true,
        },
      },
      r_bid: {
        where: { is_active: true },
        select: {
          id_bid: true,
          id_user: true,
          value: true,
          ins_at: true,
          r_user: {
            select: {
              id_user: true,
              user_1: true,
              name: true,
              r_company: {
                select: {
                  id_company: true,
                  company: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

router.use(
  "/r_access",
  createCrudRouter({
    model: "r_access",
    idField: "id_access",
    requireAuth,
  })
);

router.use("/r_asset", assetBulkRoutes);

router.use(
  "/r_asset",
  createCrudRouter({
    model: "r_asset",
    idField: "id_asset",
    requireAuth,
    ownershipCheck: true, // Enable ownership validation
  })
);

router.use("/r_attach", attachmentRoutes);

router.use(
  "/r_auction",
  createCrudRouter({
    model: "r_auction",
    idField: "id_auction",
    requireAuth,
    ownershipCheck: true, // Enable ownership validation
  })
);

router.post(
  "/r_auction/round1/template",
  requireAuth,
  requireModuleAccess("r_auction", "read"),
  async (req, res, next) => {
    try {
      const idEvent = toBigIntId(req.body?.id_event || req.query?.id_event);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("ronda_1");
      worksheet.columns = [
        { header: "placa", key: "placa", width: 22 },
        { header: "valor_oferta", key: "valor_oferta", width: 18 },
      ];

      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };

      if (idEvent) {
        const auctions = await prisma.r_auction.findMany({
          where: {
            id_event: idEvent,
            is_active: true,
          },
          select: {
            r_asset: {
              select: {
                uin: true,
              },
            },
          },
          orderBy: { id_auction: "asc" },
        });

        for (const row of auctions) {
          const plate = normalizePlate(row?.r_asset?.uin);
          if (!plate) continue;
          worksheet.addRow({
            placa: plate,
            valor_oferta: "",
          });
        }
      } else {
        worksheet.addRow({ placa: "ABC123", valor_oferta: "0.00" });
      }

      const metaSheet = workbook.addWorksheet("instrucciones");
      metaSheet.columns = [
        { header: "campo", key: "campo", width: 24 },
        { header: "regla", key: "regla", width: 90 },
      ];
      metaSheet.getRow(1).font = { bold: true };
      metaSheet.addRows([
        {
          campo: "placa",
          regla: "Obligatoria. Debe existir en el lote judicial seleccionado.",
        },
        {
          campo: "valor_oferta",
          regla: "Obligatoria. Numero decimal mayor a cero.",
        },
        {
          campo: "unicidad",
          regla: "No repetir placas en el mismo archivo.",
        },
        {
          campo: "restriccion",
          regla: "Solo se permite una carga de ronda 1 por empresa y lote.",
        },
      ]);

      const eventSuffix = idEvent ? `_evento_${idEvent}` : "";
      const fileName = `plantilla_ronda1${eventSuffix}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      return next(err);
    }
  }
);

router.post(
  "/r_auction/round1/upload",
  requireAuth,
  requireModuleAccess("r_auction", "update"),
  round1OfferUpload.single("file"),
  async (req, res, next) => {
    try {
      const idEvent = toBigIntId(req.body?.id_event);
      const requestedCompanyId = toBigIntId(req.body?.id_company);

      if (!idEvent) {
        return res.status(400).json({ ok: false, error: "INVALID_EVENT_ID" });
      }

      if (!requestedCompanyId) {
        return res.status(400).json({ ok: false, error: "INVALID_COMPANY_ID" });
      }

      if (req.auth?.isAdmin !== true) {
        const authCompanyId = toBigIntId(req.auth?.companyId);
        if (!authCompanyId) {
          return res.status(403).json({ ok: false, error: "INVALID_COMPANY_IN_TOKEN" });
        }

        if (authCompanyId !== requestedCompanyId) {
          return res.status(403).json({ ok: false, error: "COMPANY_MISMATCH" });
        }
      }

      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ ok: false, error: "FILE_REQUIRED" });
      }

      const eventRow = await prisma.r_event.findUnique({
        where: { id_event: idEvent },
        select: {
          id_event: true,
          is_active: true,
          tp_event: true,
          additional: true,
        },
      });

      if (!eventRow || eventRow.is_active !== true) {
        return res.status(404).json({ ok: false, error: "EVENT_NOT_AVAILABLE" });
      }

      const invitation = await prisma.r_invitation.findFirst({
        where: {
          id_event: idEvent,
          id_company: requestedCompanyId,
          is_active: true,
        },
        select: { id_invitation: true },
      });

      if (!invitation) {
        return res.status(403).json({ ok: false, error: "COMPANY_NOT_INVITED_FOR_EVENT" });
      }

      const companyUsers = await prisma.r_user.findMany({
        where: {
          id_company: requestedCompanyId,
          is_active: true,
        },
        select: {
          id_user: true,
        },
        orderBy: { id_user: "asc" },
      });

      if (!companyUsers.length) {
        return res.status(409).json({ ok: false, error: "COMPANY_HAS_NO_ACTIVE_USER" });
      }

      const auctionRows = await prisma.r_auction.findMany({
        where: {
          id_event: idEvent,
          is_active: true,
        },
        select: {
          id_auction: true,
          id_asset: true,
          r_asset: {
            select: {
              uin: true,
            },
          },
        },
      });

      if (!auctionRows.length) {
        return res.status(409).json({ ok: false, error: "EVENT_WITHOUT_AUCTIONS" });
      }

      const eventAuctionIds = auctionRows.map((row) => row.id_auction);
      const existingRound1 = await prisma.r_bid.findFirst({
        where: {
          id_auction: { in: eventAuctionIds },
          is_active: true,
          r_user: {
            id_company: requestedCompanyId,
          },
        },
        select: {
          id_bid: true,
        },
      });

      if (existingRound1) {
        return res.status(409).json({
          ok: false,
          error: "ROUND1_ALREADY_UPLOADED",
          message: "Esta empresa ya cargó ofertas para este lote.",
        });
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

      const headerMap = new Map();
      const headerRow = sheet.getRow(1);
      headerRow.eachCell((cell, colIndex) => {
        const name = normalizeColumnName(excelCellToString(cell));
        if (name && !headerMap.has(name)) {
          headerMap.set(name, colIndex);
        }
      });

      const requiredColumns = ["placa", "valor_oferta"];
      const missing = requiredColumns.filter((name) => !headerMap.has(name));
      if (missing.length) {
        return res.status(400).json({
          ok: false,
          error: "MISSING_REQUIRED_COLUMNS",
          missing,
          required: requiredColumns,
        });
      }

      const rowCount = Math.max(0, sheet.rowCount - 1);
      if (rowCount <= 0) {
        return res.status(400).json({ ok: false, error: "NO_DATA_ROWS" });
      }

      const auctionByPlate = new Map();
      for (const row of auctionRows) {
        const plate = normalizePlate(row?.r_asset?.uin);
        if (!plate) continue;
        auctionByPlate.set(plate, row.id_auction);
      }

      const parseResults = [];
      const stagedBids = [];
      const seenPlates = new Set();
      for (let line = 2; line <= sheet.rowCount; line += 1) {
        const excelRow = sheet.getRow(line);
        const plate = normalizePlate(excelCellToString(excelRow.getCell(headerMap.get("placa"))));
        const amountText = excelCellToString(excelRow.getCell(headerMap.get("valor_oferta")));
        const amount = toPositiveDecimal(amountText);

        if (!plate && !amountText) {
          continue;
        }

        if (!plate) {
          parseResults.push({ row: line, ok: false, error: "PLATE_REQUIRED" });
          continue;
        }

        if (!amount) {
          parseResults.push({ row: line, ok: false, plate, error: "INVALID_OFFER_VALUE" });
          continue;
        }

        if (seenPlates.has(plate)) {
          parseResults.push({ row: line, ok: false, plate, error: "DUPLICATED_PLATE_IN_FILE" });
          continue;
        }
        seenPlates.add(plate);

        const auctionId = auctionByPlate.get(plate);
        if (!auctionId) {
          parseResults.push({ row: line, ok: false, plate, error: "PLATE_NOT_IN_EVENT_LOT" });
          continue;
        }

        stagedBids.push({
          id_auction: auctionId,
          value: amount,
          plate,
          row: line,
        });
      }

      if (!stagedBids.length) {
        return res.status(400).json({
          ok: false,
          error: "NO_VALID_OFFERS",
          results: parseResults,
        });
      }

      const targetUserId = companyUsers[0].id_user;
      const created = await prisma.$transaction(async (tx) => {
        const createdRows = [];
        for (const bid of stagedBids) {
          const row = await tx.r_bid.create({
            data: {
              id_auction: bid.id_auction,
              id_user: targetUserId,
              value: bid.value,
              is_active: true,
              additional: {
                round: "ROUND_1",
                source: "lot_round1_excel",
                id_event: String(idEvent),
                id_company: String(requestedCompanyId),
                plate: bid.plate,
              },
            },
            select: {
              id_bid: true,
              id_auction: true,
              value: true,
            },
          });
          createdRows.push({ ...row, row: bid.row, plate: bid.plate, ok: true });
        }
        return createdRows;
      });

      audit({
        req,
        action: "ROUND1_BULK_UPLOAD",
        entity: "r_bid",
        entityId: null,
        data: {
          id_event: String(idEvent),
          id_company: String(requestedCompanyId),
          created_count: created.length,
          failed_count: parseResults.length,
          file_name: req.file.originalname,
        },
      });

      return res.status(201).json({
        ok: true,
        data: {
          id_event: String(idEvent),
          id_company: String(requestedCompanyId),
          summary: {
            total_rows: rowCount,
            created: created.length,
            failed: parseResults.length,
          },
          results: [...created, ...parseResults],
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

router.post(
  "/r_auction/:id_auction/bid",
  requireAuth,
  requireModuleAccess("r_bid", "create"),
  async (req, res, next) => {
    try {
      const idAuction = toBigIntId(req.params.id_auction);
      if (!idAuction) {
        return res.status(400).json({ ok: false, error: "INVALID_AUCTION_ID" });
      }

      const idUser = toBigIntId(req.auth?.sub);
      if (!idUser) {
        return res.status(401).json({ ok: false, error: "INVALID_USER_IN_TOKEN" });
      }

      const amount = toPositiveDecimal(req.body?.value);
      if (!amount) {
        return res.status(400).json({ ok: false, error: "INVALID_BID_VALUE", message: "La oferta debe ser mayor a cero" });
      }

      const auction = await prisma.r_auction.findUnique({
        where: { id_auction: idAuction },
        include: {
          r_event: {
            select: {
              id_event: true,
              is_active: true,
              start_at: true,
              end_at: true,
            },
          },
        },
      });

      if (!auction || auction.is_active !== true) {
        return res.status(404).json({ ok: false, error: "AUCTION_NOT_AVAILABLE" });
      }

      const now = new Date();
      const event = auction.r_event;
      if (!event || event.is_active !== true || now < new Date(event.start_at) || now > new Date(event.end_at)) {
        return res.status(409).json({ ok: false, error: "EVENT_NOT_ACTIVE", message: "El evento no está vigente para ofertar" });
      }

      // Non-admin users can bid only on assets connected to their company.
      if (req.auth?.isAdmin !== true) {
        const companyId = toBigIntId(req.auth?.companyId);
        if (companyId) {
          const activeInvitations = await prisma.r_invitation.count({ where: { is_active: true } });

          if (activeInvitations > 0) {
            const invitation = await prisma.r_invitation.findFirst({
              where: {
                id_event: auction.id_event,
                id_company: companyId,
                is_active: true,
              },
              select: { id_invitation: true },
            });

            if (!invitation) {
              return res.status(403).json({ ok: false, error: "EVENT_NOT_AVAILABLE_FOR_COMPANY" });
            }
          } else {
            const connection = await prisma.r_connection.findFirst({
              where: {
                id_company: companyId,
                id_asset: auction.id_asset,
                is_active: true,
              },
              select: { id_connection: true },
            });

            if (!connection) {
              return res.status(403).json({ ok: false, error: "ASSET_NOT_AVAILABLE_FOR_COMPANY" });
            }
          }
        }
      }

      if (String(auction.tp_auction || "").toUpperCase() === "SEALED_BID") {
        const existing = await prisma.r_bid.findFirst({
          where: {
            id_auction: idAuction,
            id_user: idUser,
            is_active: true,
          },
          select: { id_bid: true },
        });

        if (existing) {
          return res.status(409).json({
            ok: false,
            error: "SEALED_BID_ALREADY_SUBMITTED",
            message: "En sobre cerrado solo puedes ofertar una vez",
          });
        }
      }

      const created = await prisma.r_bid.create({
        data: {
          id_auction: idAuction,
          id_user: idUser,
          value: amount,
          is_active: true,
        },
      });

      audit({
        req,
        action: "BID_CREATE",
        entity: "r_bid",
        entityId: created.id_bid,
        data: {
          id_auction: String(idAuction),
          tp_auction: String(auction.tp_auction || ""),
          value: String(amount),
        },
      });

      return res.status(201).json({ ok: true, data: jsonSafe(created) });
    } catch (err) {
      return next(err);
    }
  }
);

router.get(
  "/r_auction/lot/:id_event/bid-summary",
  requireAuth,
  requireModuleAccess("r_auction", "read"),
  async (req, res, next) => {
    try {
      const idEvent = toBigIntId(req.params.id_event);
      if (!idEvent) {
        return res.status(400).json({ ok: false, error: "INVALID_EVENT_ID" });
      }

      const auctions = await prisma.r_auction.findMany({
        where: {
          id_event: idEvent,
          is_active: true,
        },
        select: {
          id_auction: true,
          id_asset: true,
          tp_auction: true,
          r_bid: {
            where: { is_active: true },
            select: {
              id_bid: true,
              id_user: true,
              value: true,
              ins_at: true,
              r_user: {
                select: {
                  user_1: true,
                  name: true,
                  r_company: {
                    select: {
                      company: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      const data = auctions.map((auction) => {
        const orderedBids = [...(auction.r_bid || [])].sort((left, right) => {
          const leftValue = Number(left.value || 0);
          const rightValue = Number(right.value || 0);
          if (rightValue !== leftValue) return rightValue - leftValue;

          const leftAt = new Date(left.ins_at || 0).getTime();
          const rightAt = new Date(right.ins_at || 0).getTime();
          if (leftAt !== rightAt) return leftAt - rightAt;

          return Number(left.id_bid || 0) - Number(right.id_bid || 0);
        });

        const biddersByUser = new Map();
        for (const bid of orderedBids) {
          const userKey = String(bid.id_user || "");
          if (!userKey || biddersByUser.has(userKey)) continue;
          biddersByUser.set(userKey, {
            id_user: bid.id_user,
            user: bid.r_user?.user_1 || null,
            name: bid.r_user?.name || null,
            company_name: bid.r_user?.r_company?.company || null,
          });
        }

        const leader = orderedBids[0] || null;

        return {
          id_auction: auction.id_auction,
          id_asset: auction.id_asset,
          tp_auction: auction.tp_auction,
          bid_count: orderedBids.length,
          bidders_count: biddersByUser.size,
          bidders: Array.from(biddersByUser.values()),
          leader: leader
            ? {
                id_bid: leader.id_bid,
                id_user: leader.id_user,
                user: leader.r_user?.user_1 || null,
                name: leader.r_user?.name || null,
                company_name: leader.r_user?.r_company?.company || null,
                value: leader.value,
                ins_at: leader.ins_at,
              }
            : null,
        };
      });

      return res.json({ ok: true, data: jsonSafe(data) });
    } catch (err) {
      return next(err);
    }
  }
);

async function getLotAuctionsForExport(idEvent) {
  return prisma.r_auction.findMany({
    where: {
      id_event: idEvent,
      is_active: true,
    },
    select: {
      id_auction: true,
      id_asset: true,
      r_asset: {
        select: {
          uin: true,
          location_city: true,
          location_address: true,
          realized_value: true,
          additional: true,
        },
      },
      r_bid: {
        where: { is_active: true },
        select: {
          id_bid: true,
          id_user: true,
          value: true,
          ins_at: true,
          r_user: {
            select: {
              user_1: true,
              name: true,
              r_company: {
                select: {
                  company: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { id_auction: "asc" },
  });
}

function orderBidsForWinner(bids) {
  return [...(Array.isArray(bids) ? bids : [])].sort((left, right) => {
    const leftValue = Number(left.value || 0);
    const rightValue = Number(right.value || 0);
    if (rightValue !== leftValue) return rightValue - leftValue;

    const leftAt = new Date(left.ins_at || 0).getTime();
    const rightAt = new Date(right.ins_at || 0).getTime();
    if (leftAt !== rightAt) return leftAt - rightAt;

    return Number(left.id_bid || 0) - Number(right.id_bid || 0);
  });
}

function calculateBestOfferByCompany(orderedBids) {
  const bestOfferByCompany = new Map();
  for (const bid of orderedBids) {
    const companyName = String(bid.r_user?.r_company?.company || "").trim();
    if (!companyName) continue;
    const value = Number(bid.value || 0);

    const current = bestOfferByCompany.get(companyName);
    if (current === undefined || value > current) {
      bestOfferByCompany.set(companyName, value);
    }
  }
  return bestOfferByCompany;
}

function mapRoundWinner(auction) {
  const orderedBids = orderBidsForWinner(auction.r_bid || []);
  const leader = orderedBids[0] || null;
  const leaderCompany = String(leader?.r_user?.r_company?.company || "").trim();
  const leaderValue = leader ? Number(leader.value || 0) : 0;
  const valorAdjudicacion = Number(auction.r_asset?.realized_value || 0);
  const normalizedLeaderValue = Number.isFinite(leaderValue) ? leaderValue : 0;
  const normalizedAdjudicacion = Number.isFinite(valorAdjudicacion) ? valorAdjudicacion : 0;

  return {
    orderedBids,
    leader,
    leaderCompany,
    leaderValue: normalizedLeaderValue,
    balance: normalizedLeaderValue - normalizedAdjudicacion,
    hasLeader: normalizedLeaderValue > 0,
  };
}

async function getRelaunchContextForEvent(idEvent) {
  const eventRow = await prisma.r_event.findUnique({
    where: { id_event: idEvent },
    select: {
      id_event: true,
      additional: true,
    },
  });

  const eventAdditional = jsonClone(eventRow?.additional);
  const previousEventId = toBigIntId(eventAdditional.relaunch_from_event_id);
  if (!previousEventId) {
    return {
      isRelaunch: false,
      previousEventId: null,
      previousByAssetId: new Map(),
    };
  }

  const previousAuctions = await getLotAuctionsForExport(previousEventId);
  const previousByAssetId = new Map();
  for (const auction of previousAuctions) {
    const assetKey = String(auction.id_asset || "");
    if (!assetKey) continue;

    const winner = mapRoundWinner(auction);
    previousByAssetId.set(assetKey, {
      id_event: String(previousEventId),
      id_auction: String(auction.id_auction || ""),
      company_name: winner.leaderCompany,
      valor_ganador: winner.leaderValue,
      balance: winner.balance,
      winner_bid: winner.leader || null,
    });
  }

  return {
    isRelaunch: true,
    previousEventId,
    previousByAssetId,
  };
}

function buildLotResultWorkbook(auctions, options = {}) {
  const previousByAssetId = options.previousByAssetId instanceof Map
    ? options.previousByAssetId
    : new Map();

  const companySet = new Set();
  for (const auction of auctions) {
    for (const bid of auction.r_bid || []) {
      const companyName = String(bid.r_user?.r_company?.company || "").trim();
      if (companyName) companySet.add(companyName);
    }
  }
  const companyColumns = Array.from(companySet).sort((a, b) => a.localeCompare(b, "es"));

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("resultado_cierre");

  const columns = [
    { header: "placa", key: "placa", width: 18 },
    { header: "ciudad", key: "ciudad", width: 20 },
    { header: "direccion", key: "direccion", width: 30 },
    { header: "Marca", key: "Marca", width: 18 },
    { header: "Modelo", key: "Modelo", width: 18 },
    { header: "Año", key: "Año", width: 12 },
    { header: "valor adjudicación", key: "valor_adjudicacion", width: 18 },
  ];

  for (const companyName of companyColumns) {
    columns.push({
      header: `oferta - ${companyName}`,
      key: `offer__${companyName}`,
      width: 22,
    });
  }

  columns.push({ header: "compañia ganadora", key: "compania_ganadora", width: 24 });
  columns.push({ header: "valor ganador", key: "valor_ganador", width: 16 });
  columns.push({ header: "balance", key: "balance", width: 16 });
  columns.push({ header: "balance anterior", key: "balance_anterior", width: 18 });
  columns.push({ header: "diferencia", key: "diferencia", width: 16 });

  worksheet.columns = columns;
  worksheet.getRow(1).font = { bold: true };

  for (const auction of auctions) {
    const asset = auction.r_asset || {};
    const additional = jsonClone(asset.additional);

    const placa = normalizePlate(asset.uin) || "-";
    const ciudad = getStringFromAdditional(additional, ["ciudad", "city"]) || String(asset.location_city || "").trim();
    const direccion = getStringFromAdditional(additional, ["direccion", "address"]) || String(asset.location_address || "").trim();
    const marca = getStringFromAdditional(additional, ["marca", "brand"]) || "";
    const modelo = getStringFromAdditional(additional, ["modelo", "model"]) || "";
    const anio = getStringFromAdditional(additional, ["anio", "year"]) || "";
    const valorAdjudicacion = Number(asset.realized_value || 0);

    const currentRound = mapRoundWinner(auction);
    const previousRound = previousByAssetId.get(String(auction.id_asset || "")) || null;
    const superiorOffers = currentRound.orderedBids.filter((bid) => {
      if (!previousRound) return false;
      return Number(bid.value || 0) > Number(previousRound.valor_ganador || 0);
    });

    // In relaunch rounds, keep previous winner/value when no offer beats prior winner value.
    const keepPreviousWinner = !!previousRound && superiorOffers.length === 0;

    const leaderCompany = keepPreviousWinner
      ? String(previousRound.company_name || "")
      : currentRound.leaderCompany;
    const leaderValue = keepPreviousWinner
      ? Number(previousRound.valor_ganador || 0)
      : Number(currentRound.leaderValue || 0);

    const normalizedAdjudicacion = Number.isFinite(valorAdjudicacion) ? valorAdjudicacion : 0;
    const normalizedLeaderValue = Number.isFinite(leaderValue) ? leaderValue : 0;
    const balance = normalizedLeaderValue - normalizedAdjudicacion;
    const balanceAnterior = previousRound ? Number(previousRound.balance || 0) : 0;

    const bestOfferByCompany = calculateBestOfferByCompany(currentRound.orderedBids);

    const row = {
      placa,
      ciudad,
      direccion,
      Marca: marca,
      Modelo: modelo,
      "Año": anio,
      valor_adjudicacion: normalizedAdjudicacion,
      compania_ganadora: leaderCompany || "",
      valor_ganador: normalizedLeaderValue,
      balance,
      balance_anterior: balanceAnterior,
      diferencia: balance - balanceAnterior,
    };

    for (const companyName of companyColumns) {
      const key = `offer__${companyName}`;
      const value = bestOfferByCompany.get(companyName);
      row[key] = value === undefined ? "" : value;
    }

    worksheet.addRow(row);
  }

  return { workbook, companyColumns };
}

async function closeLotEvent(idEvent, auth) {
  const eventRow = await prisma.r_event.findUnique({
    where: { id_event: idEvent },
    select: {
      id_event: true,
      additional: true,
    },
  });

  if (!eventRow) return false;

  const now = new Date();
  const eventAdditional = jsonClone(eventRow.additional);
  await prisma.r_event.update({
    where: { id_event: idEvent },
    data: {
      is_active: false,
      end_at: now,
      additional: {
        ...eventAdditional,
        lot_stage: "CLOSED",
        closed_at: now.toISOString(),
        closed_by: {
          id_user: String(auth?.sub || ""),
          user: String(auth?.login || ""),
        },
      },
    },
  });

  return true;
}

router.post(
  "/r_auction/lot/:id_event/close",
  requireAuth,
  requireModuleAccess("r_auction", "update"),
  async (req, res, next) => {
    try {
      const idEvent = toBigIntId(req.params.id_event);
      if (!idEvent) {
        return res.status(400).json({ ok: false, error: "INVALID_EVENT_ID" });
      }

      const closed = await closeLotEvent(idEvent, req.auth);
      if (!closed) {
        return res.status(404).json({ ok: false, error: "EVENT_NOT_FOUND" });
      }

      audit({
        req,
        action: "LOT_CLOSE",
        entity: "r_event",
        entityId: idEvent,
        data: {
          id_event: String(idEvent),
        },
      });

      return res.json({ ok: true, data: { id_event: String(idEvent), lot_stage: "CLOSED" } });
    } catch (err) {
      return next(err);
    }
  }
);

router.get(
  "/r_auction/lot/:id_event/export",
  requireAuth,
  requireModuleAccess("r_auction", "read"),
  async (req, res, next) => {
    try {
      const idEvent = toBigIntId(req.params.id_event);
      if (!idEvent) {
        return res.status(400).json({ ok: false, error: "INVALID_EVENT_ID" });
      }

      const auctions = await getLotAuctionsForExport(idEvent);
      if (!auctions.length) {
        return res.status(409).json({ ok: false, error: "EVENT_WITHOUT_AUCTIONS" });
      }

      const relaunchContext = await getRelaunchContextForEvent(idEvent);
      const { workbook } = buildLotResultWorkbook(auctions, {
        previousByAssetId: relaunchContext.previousByAssetId,
      });
      const fileName = `cierre_lote_${idEvent}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      await workbook.xlsx.write(res);
      return res.end();
    } catch (err) {
      return next(err);
    }
  }
);

router.post(
  "/r_auction/lot/:id_event/relaunch",
  requireAuth,
  requireModuleAccess("r_auction", "create"),
  async (req, res, next) => {
    try {
      const idEvent = toBigIntId(req.params.id_event);
      if (!idEvent) {
        return res.status(400).json({ ok: false, error: "INVALID_EVENT_ID" });
      }

      const sourceEvent = await prisma.r_event.findUnique({
        where: { id_event: idEvent },
        select: {
          id_event: true,
          tp_event: true,
          start_at: true,
          end_at: true,
          is_active: true,
          additional: true,
        },
      });

      if (!sourceEvent) {
        return res.status(404).json({ ok: false, error: "EVENT_NOT_FOUND" });
      }

      const sourceAdditional = jsonClone(sourceEvent.additional);
      const sourceLotType = String(sourceAdditional.lot_type || "").toUpperCase();
      const sourceLotStage = String(sourceAdditional.lot_stage || "").toUpperCase();
      const sourceIsClosed = sourceEvent.is_active === false || sourceLotStage === "CLOSED";
      if (sourceLotType !== "JUDICIAL_LOT" || !sourceIsClosed) {
        return res.status(409).json({ ok: false, error: "LOT_MUST_BE_CLOSED_TO_RELAUNCH" });
      }

      const sourceInvitations = await prisma.r_invitation.findMany({
        where: {
          id_event: idEvent,
          is_active: true,
        },
        select: {
          id_company: true,
        },
      });

      const sourceAuctions = await prisma.r_auction.findMany({
        where: {
          id_event: idEvent,
          is_active: true,
          r_asset: {
            is: { is_active: true },
          },
        },
        select: {
          id_asset: true,
          tp_auction: true,
        },
      });

      if (!sourceAuctions.length) {
        return res.status(409).json({ ok: false, error: "EVENT_WITHOUT_AUCTIONS" });
      }

      const requestedStartAt = req.body?.start_at ? new Date(req.body.start_at) : null;
      const requestedEndAt = req.body?.end_at ? new Date(req.body.end_at) : null;
      const isRequestedStartValid = requestedStartAt instanceof Date && Number.isFinite(requestedStartAt.getTime());
      const isRequestedEndValid = requestedEndAt instanceof Date && Number.isFinite(requestedEndAt.getTime());

      let startAt;
      let endAt;
      if (isRequestedStartValid || isRequestedEndValid) {
        if (!isRequestedStartValid || !isRequestedEndValid) {
          return res.status(400).json({ ok: false, error: "START_AND_END_REQUIRED" });
        }
        if (requestedStartAt.getTime() >= requestedEndAt.getTime()) {
          return res.status(400).json({ ok: false, error: "INVALID_DATE_RANGE" });
        }
        startAt = requestedStartAt;
        endAt = requestedEndAt;
      } else {
        const sourceStart = sourceEvent.start_at ? new Date(sourceEvent.start_at) : null;
        const sourceEnd = sourceEvent.end_at ? new Date(sourceEvent.end_at) : null;
        const sourceDurationMs = sourceStart && sourceEnd
          ? sourceEnd.getTime() - sourceStart.getTime()
          : 0;

        const fallbackDurationMs = sourceDurationMs > 0 ? sourceDurationMs : (24 * 60 * 60 * 1000);
        startAt = new Date();
        endAt = new Date(startAt.getTime() + fallbackDurationMs);
      }

      const sourceLotName = String(sourceAdditional.lot_name || `Lote #${idEvent}`).trim();
      const relaunchRound = Number.parseInt(String(sourceAdditional.relaunch_round || "1"), 10);
      const nextRelaunchRound = Number.isSafeInteger(relaunchRound) && relaunchRound > 0
        ? relaunchRound + 1
        : 2;
      const baseLotEventId = String(sourceAdditional.base_lot_event_id || idEvent);

      const created = await prisma.$transaction(async (tx) => {
        const event = await tx.r_event.create({
          data: {
            tp_event: sourceEvent.tp_event || "SEALED_BID",
            start_at: startAt,
            end_at: endAt,
            is_active: true,
            additional: {
              lot_type: "JUDICIAL_LOT",
              lot_stage: "ROUND_1_OPEN",
              lot_name: `${sourceLotName} - Relanzado R${nextRelaunchRound}`,
              relaunch_round: nextRelaunchRound,
              relaunch_from_event_id: String(idEvent),
              base_lot_event_id: baseLotEventId,
            },
          },
          select: {
            id_event: true,
          },
        });

        const invitationRows = sourceInvitations
          .map((row) => ({
            id_event: event.id_event,
            id_company: row.id_company,
            is_active: true,
          }));

        if (invitationRows.length) {
          await tx.r_invitation.createMany({
            data: invitationRows,
          });
        }

        const auctionRows = sourceAuctions.map((row) => ({
          id_event: event.id_event,
          id_asset: row.id_asset,
          tp_auction: row.tp_auction || "SEALED_BID",
          is_active: true,
        }));

        await tx.r_auction.createMany({
          data: auctionRows,
        });

        return {
          id_event: event.id_event,
          invitations: invitationRows.length,
          auctions: auctionRows.length,
        };
      });

      audit({
        req,
        action: "LOT_RELAUNCH",
        entity: "r_event",
        entityId: created.id_event,
        data: {
          source_id_event: String(idEvent),
          new_id_event: String(created.id_event),
          invitations: created.invitations,
          auctions: created.auctions,
        },
      });

      return res.status(201).json({
        ok: true,
        data: {
          source_id_event: String(idEvent),
          id_event: String(created.id_event),
          invitations: created.invitations,
          auctions: created.auctions,
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

router.get(
  "/r_auction/lot/:id_event/close-and-export",
  requireAuth,
  requireModuleAccess("r_auction", "update"),
  async (req, res, next) => {
    try {
      const idEvent = toBigIntId(req.params.id_event);
      if (!idEvent) {
        return res.status(400).json({ ok: false, error: "INVALID_EVENT_ID" });
      }

      const eventExists = await prisma.r_event.findUnique({
        where: { id_event: idEvent },
        select: { id_event: true },
      });
      if (!eventExists) {
        return res.status(404).json({ ok: false, error: "EVENT_NOT_FOUND" });
      }

      const auctions = await getLotAuctionsForExport(idEvent);

      if (!auctions.length) {
        return res.status(409).json({ ok: false, error: "EVENT_WITHOUT_AUCTIONS" });
      }

      const { workbook, companyColumns } = buildLotResultWorkbook(auctions);

      await closeLotEvent(idEvent, req.auth);

      audit({
        req,
        action: "LOT_CLOSE_AND_EXPORT",
        entity: "r_event",
        entityId: idEvent,
        data: {
          id_event: String(idEvent),
          companies_with_bids: companyColumns.length,
          vehicles: auctions.length,
        },
      });

      const fileName = `cierre_lote_${idEvent}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      await workbook.xlsx.write(res);
      return res.end();
    } catch (err) {
      return next(err);
    }
  }
);

router.get(
  "/r_auction_resolution",
  requireAuth,
  requireModuleAccess("r_auction_resolution", "read"),
  async (req, res, next) => {
    try {
      const rows = await prisma.r_auction.findMany({
        where: {
          tp_auction: "SEALED_BID",
          is_active: true,
        },
        include: {
          r_asset: {
            select: {
              id_asset: true,
              uin: true,
              tp_asset: true,
              status: true,
              realized_value: true,
              additional: true,
            },
          },
          r_event: {
            select: {
              id_event: true,
              tp_event: true,
              start_at: true,
              end_at: true,
              is_active: true,
              additional: true,
            },
          },
          r_bid: {
            where: { is_active: true },
            select: {
              id_bid: true,
              id_user: true,
              value: true,
              ins_at: true,
              r_user: {
                select: {
                  id_user: true,
                  user_1: true,
                  name: true,
                  r_company: {
                    select: {
                      id_company: true,
                      company: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { id_auction: "desc" },
        take: 200,
      });

      return res.json({ ok: true, data: jsonSafe(rows.map(mapAuctionResolutionRow)) });
    } catch (err) {
      return next(err);
    }
  }
);

router.post(
  "/r_auction_resolution/:id_auction/resolve",
  requireAuth,
  requireModuleAccess("r_auction_resolution", "update"),
  async (req, res, next) => {
    try {
      const idAuction = toBigIntId(req.params.id_auction);
      if (!idAuction) {
        return res.status(400).json({ ok: false, error: "INVALID_AUCTION_ID" });
      }

      const auction = await getAuctionWithResolutionContext(idAuction);
      if (!auction || auction.is_active !== true) {
        return res.status(404).json({ ok: false, error: "AUCTION_NOT_AVAILABLE" });
      }
      if (String(auction.tp_auction || "").toUpperCase() !== "SEALED_BID") {
        return res.status(409).json({ ok: false, error: "ONLY_SEALED_BID_SUPPORTED" });
      }

      const summary = normalizeAuctionResolution(auction, auction.r_bid);
      if (!summary.winnerBid) {
        return res.status(409).json({ ok: false, error: "NO_BIDS_TO_RESOLVE" });
      }

      const now = new Date();
      const currentAuctionAdditional = jsonClone(auction.additional);
      const currentAssetAdditional = jsonClone(auction.r_asset?.additional);
      const winner = summary.winnerBid.r_user;
      const resolutionPayload = {
        resolved_at: now.toISOString(),
        resolved_by: {
          id_user: String(req.auth?.sub || ""),
          user: String(req.auth?.login || ""),
        },
        rule: summary.rule,
        tie_count: summary.tiedBidCount,
        winner: {
          id_bid: String(summary.winnerBid.id_bid),
          id_user: String(summary.winnerBid.id_user),
          user: winner?.user_1 || null,
          name: winner?.name || null,
          company_name: winner?.r_company?.company || null,
          value: summary.topValue,
          ins_at: summary.winnerBid.ins_at,
        },
      };

      const updated = await prisma.$transaction(async (tx) => {
        const updatedAuction = await tx.r_auction.update({
          where: { id_auction: idAuction },
          data: {
            additional: {
              ...currentAuctionAdditional,
              resolution: resolutionPayload,
            },
          },
        });

        await tx.r_asset.update({
          where: { id_asset: auction.id_asset },
          data: {
            status: "SOLD",
            realized_value: summary.topValue,
            additional: {
              ...currentAssetAdditional,
              resolution: {
                auction_id: String(idAuction),
                ...resolutionPayload,
              },
            },
          },
        });

        return updatedAuction;
      });

      audit({
        req,
        action: "AUCTION_RESOLVE",
        entity: "r_auction",
        entityId: updated.id_auction,
        data: {
          id_auction: String(updated.id_auction),
          winner_user: resolutionPayload.winner.user,
          winner_value: resolutionPayload.winner.value,
          tie_count: resolutionPayload.tie_count,
          rule: resolutionPayload.rule,
        },
      });

      const resolvedAuction = await getAuctionWithResolutionContext(idAuction);
      return res.json({ ok: true, data: jsonSafe(mapAuctionResolutionRow(resolvedAuction)) });
    } catch (err) {
      return next(err);
    }
  }
);

router.get("/r_buyer_offer", requireAuth, async (req, res, next) => {
  try {
    const idUser = toBigIntId(req.auth?.sub);
    if (!idUser) {
      return res.status(401).json({ ok: false, error: "INVALID_USER_IN_TOKEN" });
    }

    const isAdmin = req.auth?.isAdmin === true;
    const companyId = toBigIntId(req.auth?.companyId);

    const hasValidCompany = !!companyId;

    const activeInvitations = await prisma.r_invitation.count({ where: { is_active: true } });

    const where = {
      is_active: true,
      r_asset: {
        is: {
          is_active: true,
        },
      },
      r_event: {
        is: {
          is_active: true,
        },
      },
    };

    if (!isAdmin && hasValidCompany) {
      if (activeInvitations > 0) {
        where.r_event = {
          is: {
            is_active: true,
            r_invitation: {
              some: {
                id_company: companyId,
                is_active: true,
              },
            },
          },
        };
      } else {
        where.r_asset = {
          is: {
            is_active: true,
            r_connection: {
              some: {
                id_company: companyId,
                is_active: true,
              },
            },
          },
        };
      }
    }

    const auctions = await prisma.r_auction.findMany({
      where,
      orderBy: { id_auction: "desc" },
      include: {
        r_asset: {
          select: {
            id_asset: true,
            tp_asset: true,
            uin: true,
            location_city: true,
            starting_bid: true,
            additional: true,
          },
        },
        r_event: {
          select: {
            id_event: true,
            is_active: true,
            start_at: true,
            end_at: true,
          },
        },
        r_bid: {
          where: { is_active: true },
          select: {
            id_user: true,
            value: true,
          },
        },
      },
      take: 1000,
    });

    const grouped = new Map();
    for (const row of auctions) {
      const key = String(row.id_asset || "");
      if (!key || grouped.has(key)) continue;
      grouped.set(key, row);
    }

    const now = new Date();
    const data = Array.from(grouped.values()).map((row) => {
      const startAt = row.r_event?.start_at ? new Date(row.r_event.start_at) : null;
      const endAt = row.r_event?.end_at ? new Date(row.r_event.end_at) : null;
      const isEventOpen = row.r_event?.is_active === true && (!startAt || now >= startAt) && (!endAt || now <= endAt);

      let topBid = 0;
      let myBid = 0;
      let alreadyBid = false;
      for (const bid of row.r_bid || []) {
        const value = Number(bid.value || 0);
        if (value > topBid) topBid = value;
        if (String(bid.id_user || "") === String(idUser)) {
          alreadyBid = true;
          if (value > myBid) myBid = value;
        }
      }

      const tpAuction = String(row.tp_auction || "").toUpperCase();
      const currentOffer = topBid > 0 ? topBid : Number(row.r_asset?.starting_bid || 0);
      const canBid = isEventOpen && !(tpAuction === "SEALED_BID" && alreadyBid);

      let eventStatus = "CERRADO";
      if (isEventOpen) eventStatus = "VIGENTE";
      else if (startAt && now < startAt) eventStatus = "PROGRAMADO";

      const additional = jsonClone(row.r_asset?.additional);
      const brand = getStringFromAdditional(additional, ["marca", "brand"]);
      const model = getStringFromAdditional(additional, ["modelo", "model"]);
      const year = getStringFromAdditional(additional, ["anio", "year"]);

      return {
        id_asset: row.r_asset?.id_asset,
        tp_asset: row.r_asset?.tp_asset,
        plate: normalizePlate(row.r_asset?.uin),
        city: String(row.r_asset?.location_city || "").trim(),
        brand: brand || "",
        model: model || "",
        year: year || "",
        id_auction: row.id_auction,
        tp_auction: tpAuction,
        id_event: row.r_event?.id_event,
        event_status: eventStatus,
        current_offer: currentOffer,
        my_offer: myBid,
        already_bid: alreadyBid,
        can_bid: canBid,
      };
    }).filter((row) => row.event_status === "VIGENTE");

    return res.json({ ok: true, data: jsonSafe(data) });
  } catch (err) {
    return next(err);
  }
});

router.get("/r_buyer_won", requireAuth, async (req, res, next) => {
  try {
    const idUser = toBigIntId(req.auth?.sub);
    if (!idUser) {
      return res.status(401).json({ ok: false, error: "INVALID_USER_IN_TOKEN" });
    }

    if (req.auth?.isAdmin !== true && !isBuyerAuth(req.auth)) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN_BUYER_ONLY" });
    }

    const auctions = await prisma.r_auction.findMany({
      where: {
        is_active: true,
        r_asset: {
          is: {
            is_active: true,
          },
        },
        r_bid: {
          some: {
            id_user: idUser,
            is_active: true,
          },
        },
      },
      orderBy: { id_auction: "desc" },
      include: {
        r_asset: {
          select: {
            id_asset: true,
            tp_asset: true,
            uin: true,
            status: true,
            appraised_value: true,
            location_city: true,
            additional: true,
            r_attach: {
              where: { is_active: true },
              orderBy: { id_attach: "desc" },
              select: {
                id_attach: true,
                tp_attach: true,
                file_name: true,
                mime_type: true,
                file_size_bytes: true,
                ins_at: true,
                file_content: true,
              },
            },
          },
        },
        r_event: {
          select: {
            id_event: true,
            start_at: true,
            end_at: true,
          },
        },
        r_bid: {
          where: { is_active: true },
          select: {
            id_bid: true,
            id_user: true,
            value: true,
            ins_at: true,
          },
        },
      },
      take: 1000,
    });

    const uniqueWonAssets = new Map();

    for (const auction of auctions) {
      if (!didUserWinAuction(auction, idUser)) continue;

      const idAssetKey = String(auction?.r_asset?.id_asset || "").trim();
      if (!idAssetKey) continue;

      const current = uniqueWonAssets.get(idAssetKey);
      if (current && Number(current.id_auction || 0) > Number(auction.id_auction || 0)) {
        continue;
      }

      const summary = normalizeAuctionResolution(auction, auction?.r_bid || []);
      const additional = jsonClone(auction?.additional);
      const assetAdditional = jsonClone(auction?.r_asset?.additional);

      const brand = getStringFromAdditional(assetAdditional, ["brand", "marca", "make"]);
      const model = getStringFromAdditional(assetAdditional, ["model", "modelo"]);
      const year = getStringFromAdditional(assetAdditional, ["year", "anio"]);
      const appraisedValue = Number(auction?.r_asset?.appraised_value || 0);

      const attachments = (auction?.r_asset?.r_attach || []).map((attach) => {
        const isAppraisal = isAppraisalAttachmentType(attach?.tp_attach);
        const idAttach = String(attach?.id_attach || "").trim();
        const idAsset = String(auction?.r_asset?.id_asset || "").trim();
        return {
          id_attach: attach.id_attach,
          tp_attach: String(attach?.tp_attach || ""),
          file_name: attach?.file_name || null,
          mime_type: attach?.mime_type || null,
          file_size_bytes: attach?.file_size_bytes || null,
          has_file: Buffer.isBuffer(attach?.file_content),
          is_appraisal: isAppraisal,
          uploaded_at: attach?.ins_at || null,
          download_url: idAttach && idAsset
            ? `/api/r_buyer_won/${encodeURIComponent(idAsset)}/attachments/${encodeURIComponent(idAttach)}/download`
            : null,
        };
      });

      const appraisalDocs = attachments.filter((item) => item.is_appraisal);
      const otherDocs = attachments.filter((item) => !item.is_appraisal);

      uniqueWonAssets.set(idAssetKey, {
        id_asset: auction?.r_asset?.id_asset,
        id_auction: auction?.id_auction,
        id_event: auction?.r_event?.id_event || null,
        tp_asset: auction?.r_asset?.tp_asset || null,
        plate: normalizePlate(auction?.r_asset?.uin),
        city: String(auction?.r_asset?.location_city || "").trim(),
        brand: brand || "",
        model: model || "",
        year: year || "",
        asset_status: auction?.r_asset?.status || null,
        won_value: summary.topValue,
        resolved_at: additional?.resolution?.resolved_at || summary.winnerBid?.ins_at || null,
        appraised_value: appraisedValue,
        appraisal_available: appraisedValue > 0 || appraisalDocs.length > 0,
        documents_available: otherDocs.length > 0,
        appraisal_documents: appraisalDocs,
        documents: otherDocs,
      });
    }

    const data = Array.from(uniqueWonAssets.values()).sort((left, right) => {
      const leftAt = new Date(left.resolved_at || 0).getTime();
      const rightAt = new Date(right.resolved_at || 0).getTime();
      if (rightAt !== leftAt) return rightAt - leftAt;
      return Number(right.id_asset || 0) - Number(left.id_asset || 0);
    });

    return res.json({ ok: true, data: jsonSafe(data) });
  } catch (err) {
    return next(err);
  }
});

router.get("/r_buyer_won/:id_asset/attachments/:id_attach/download", requireAuth, async (req, res, next) => {
  try {
    const idUser = toBigIntId(req.auth?.sub);
    if (!idUser) {
      return res.status(401).json({ ok: false, error: "INVALID_USER_IN_TOKEN" });
    }

    if (req.auth?.isAdmin !== true && !isBuyerAuth(req.auth)) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN_BUYER_ONLY" });
    }

    const idAsset = toBigIntId(req.params?.id_asset);
    const idAttach = toBigIntId(req.params?.id_attach);
    if (!idAsset || !idAttach) {
      return res.status(400).json({ ok: false, error: "INVALID_ID" });
    }

    const auctions = await prisma.r_auction.findMany({
      where: {
        is_active: true,
        id_asset: idAsset,
      },
      select: {
        additional: true,
        r_bid: {
          where: { is_active: true },
          select: {
            id_bid: true,
            id_user: true,
            value: true,
            ins_at: true,
          },
        },
      },
      take: 100,
    });

    const wonAsset = auctions.some((auction) => didUserWinAuction(auction, idUser));
    if (!wonAsset) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN_ASSET_NOT_WON" });
    }

    const attachment = await prisma.r_attach.findFirst({
      where: {
        id_attach: idAttach,
        id_asset: idAsset,
        is_active: true,
      },
      select: {
        id_attach: true,
        file_name: true,
        mime_type: true,
        file_content: true,
      },
    });

    if (!attachment) {
      return res.status(404).json({ ok: false, error: "ATTACHMENT_NOT_FOUND" });
    }

    if (!Buffer.isBuffer(attachment.file_content)) {
      return res.status(404).json({ ok: false, error: "ATTACHMENT_FILE_NOT_FOUND" });
    }

    const fileName = sanitizeDownloadFileName(attachment.file_name, `adjunto-${idAttach}.bin`);
    const mimeType = String(attachment.mime_type || "application/octet-stream");

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(Buffer.from(attachment.file_content));
  } catch (err) {
    return next(err);
  }
});

router.get("/r_buyer_offer/round1/template", requireAuth, async (req, res, next) => {
  try {
    const idEvent = toBigIntId(req.query?.id_event);
    if (!idEvent) {
      return res.status(400).json({ ok: false, error: "INVALID_EVENT_ID" });
    }

    const companyId = toBigIntId(req.auth?.companyId);
    if (!companyId) {
      return res.status(403).json({ ok: false, error: "INVALID_COMPANY_IN_TOKEN" });
    }

    const eventRow = await prisma.r_event.findUnique({
      where: { id_event: idEvent },
      select: { id_event: true, is_active: true, additional: true },
    });

    if (!eventRow || eventRow.is_active !== true) {
      return res.status(404).json({ ok: false, error: "EVENT_NOT_AVAILABLE" });
    }

    const invitation = await prisma.r_invitation.findFirst({
      where: {
        id_event: idEvent,
        id_company: companyId,
        is_active: true,
      },
      select: { id_invitation: true },
    });

    if (!invitation) {
      return res.status(403).json({ ok: false, error: "COMPANY_NOT_INVITED_FOR_EVENT" });
    }

    const relaunchContext = await getRelaunchContextForEvent(idEvent);

    const auctions = await prisma.r_auction.findMany({
      where: {
        id_event: idEvent,
        is_active: true,
        r_asset: {
          is: { is_active: true },
        },
      },
      select: {
        id_asset: true,
        r_asset: {
          select: {
            uin: true,
            location_city: true,
            location_address: true,
            status: true,
            book_value: true,
            appraised_value: true,
            expected_value: true,
            reserve_price: true,
            starting_bid: true,
            is_active: true,
            additional: true,
          },
        },
      },
      orderBy: { id_auction: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("ofertas_lote");
    const worksheetColumns = [
      { header: "placa", key: "placa", width: 22 },
      { header: "ciudad", key: "ciudad", width: 22 },
      { header: "direccion", key: "direccion", width: 32 },
      { header: "Marca", key: "Marca", width: 18 },
      { header: "Modelo", key: "Modelo", width: 18 },
      { header: "Año", key: "Año", width: 12 },
    ];

    if (relaunchContext.isRelaunch) {
      worksheetColumns.push({ header: "valor ganador", key: "valor_ganador", width: 18 });
    }
    worksheetColumns.push({ header: "oferta", key: "oferta", width: 16 });

    worksheet.columns = worksheetColumns;

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };

    for (const row of auctions) {
      const asset = row?.r_asset || {};
      const plate = normalizePlate(asset.uin);
      if (!plate) continue;
      const additional = jsonClone(asset.additional);
      const marca = getStringFromAdditional(additional, ["marca", "brand"]) || "";
      const modelo = getStringFromAdditional(additional, ["modelo", "model"]) || "";
      const anio = getStringFromAdditional(additional, ["anio", "year"]) || "";
      const previousRound = relaunchContext.previousByAssetId.get(String(row.id_asset || "")) || null;

      worksheet.addRow({
        placa: plate,
        ciudad: String(asset.location_city || "").trim(),
        direccion: String(asset.location_address || "").trim(),
        Marca: marca,
        Modelo: modelo,
        "Año": anio,
        valor_ganador: relaunchContext.isRelaunch
          ? Number(previousRound?.valor_ganador || 0)
          : undefined,
        oferta: "",
      });
    }

    const infoSheet = workbook.addWorksheet("instrucciones");
    infoSheet.columns = [
      { header: "campo", key: "campo", width: 24 },
      { header: "regla", key: "regla", width: 90 },
    ];
    infoSheet.getRow(1).font = { bold: true };
    infoSheet.addRows([
      {
        campo: "placa",
        regla: "Obligatoria. Debe existir en el lote judicial habilitado para tu compañía.",
      },
      {
        campo: "oferta",
        regla: "Obligatoria. Debe ser un numero entero positivo mayor a cero.",
      },
      {
        campo: "valor ganador",
        regla: relaunchContext.isRelaunch
          ? "Informativa para relanzamiento. Refleja el valor ganador de la ronda anterior por vehículo."
          : "No aplica para lotes sin relanzamiento.",
      },
      {
        campo: "unicidad",
        regla: "No repetir placas en el mismo archivo.",
      },
      {
        campo: "restriccion",
        regla: "Para sobre cerrado solo se permite una oferta por usuario y vehículo.",
      },
      {
        campo: "nota",
        regla: "La plantilla replica la estructura del lote judicial y excluye la columna valor adjudicacion.",
      },
    ]);

    const fileName = `plantilla_ofertas_evento_${idEvent}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    return next(err);
  }
});

router.post(
  "/r_buyer_offer/round1/upload",
  requireAuth,
  round1OfferUpload.single("file"),
  async (req, res, next) => {
    try {
      const idEvent = toBigIntId(req.body?.id_event);
      if (!idEvent) {
        return res.status(400).json({ ok: false, error: "INVALID_EVENT_ID" });
      }

      const idUser = toBigIntId(req.auth?.sub);
      if (!idUser) {
        return res.status(401).json({ ok: false, error: "INVALID_USER_IN_TOKEN" });
      }

      const companyId = toBigIntId(req.auth?.companyId);
      if (!companyId) {
        return res.status(403).json({ ok: false, error: "INVALID_COMPANY_IN_TOKEN" });
      }

      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ ok: false, error: "FILE_REQUIRED" });
      }

      const eventRow = await prisma.r_event.findUnique({
        where: { id_event: idEvent },
        select: {
          id_event: true,
          is_active: true,
          start_at: true,
          end_at: true,
        },
      });

      if (!eventRow || eventRow.is_active !== true) {
        return res.status(404).json({ ok: false, error: "EVENT_NOT_AVAILABLE" });
      }

      const now = new Date();
      if (now < new Date(eventRow.start_at) || now > new Date(eventRow.end_at)) {
        return res.status(409).json({ ok: false, error: "EVENT_NOT_ACTIVE", message: "El lote no está vigente para ofertar" });
      }

      const invitation = await prisma.r_invitation.findFirst({
        where: {
          id_event: idEvent,
          id_company: companyId,
          is_active: true,
        },
        select: { id_invitation: true },
      });

      if (!invitation) {
        return res.status(403).json({ ok: false, error: "COMPANY_NOT_INVITED_FOR_EVENT" });
      }

      const auctionRows = await prisma.r_auction.findMany({
        where: {
          id_event: idEvent,
          is_active: true,
          r_asset: {
            is: { is_active: true },
          },
        },
        select: {
          id_auction: true,
          tp_auction: true,
          r_asset: {
            select: {
              uin: true,
            },
          },
        },
      });

      if (!auctionRows.length) {
        return res.status(409).json({ ok: false, error: "EVENT_WITHOUT_AUCTIONS" });
      }

      const workbook = new ExcelJS.Workbook();
      try {
        await workbook.xlsx.load(req.file.buffer);
      } catch (err) {
        return res.status(400).json({ ok: false, error: "INVALID_EXCEL_FILE", message: err.message });
      }

      const sheet = workbook.worksheets[0];
      if (!sheet) {
        return res.status(400).json({ ok: false, error: "EMPTY_WORKBOOK" });
      }

      const headerMap = new Map();
      const headerRow = sheet.getRow(1);
      headerRow.eachCell((cell, colIndex) => {
        const normalized = normalizeColumnName(excelCellToString(cell));
        if (!normalized) return;

        const canonicalName = normalized === "valor_oferta" ? "oferta" : normalized;
        if (canonicalName && !headerMap.has(canonicalName)) {
          headerMap.set(canonicalName, colIndex);
        }
      });

      const requiredColumns = ["placa", "oferta"];
      const missing = requiredColumns.filter((name) => !headerMap.has(name));
      if (missing.length) {
        return res.status(400).json({ ok: false, error: "MISSING_REQUIRED_COLUMNS", missing, required: requiredColumns });
      }

      const auctionByPlate = new Map();
      for (const row of auctionRows) {
        const plate = normalizePlate(row?.r_asset?.uin);
        if (!plate) continue;
        auctionByPlate.set(plate, {
          id_auction: row.id_auction,
          tp_auction: String(row.tp_auction || "").toUpperCase(),
        });
      }

      const parseResults = [];
      const stagedBids = [];
      const seenPlates = new Set();
      for (let line = 2; line <= sheet.rowCount; line += 1) {
        const excelRow = sheet.getRow(line);
        const plate = normalizePlate(excelCellToString(excelRow.getCell(headerMap.get("placa"))));
        const amountText = excelCellToString(excelRow.getCell(headerMap.get("oferta")));
        const amount = toPositiveInteger(amountText);

        if (!plate && !amountText) continue;

        if (!plate) {
          parseResults.push({ row: line, ok: false, error: "PLATE_REQUIRED" });
          continue;
        }

        if (!amount) {
          parseResults.push({
            row: line,
            ok: false,
            plate,
            error: "INVALID_OFFER_VALUE",
            message: "La oferta debe ser un entero positivo",
          });
          continue;
        }

        if (seenPlates.has(plate)) {
          parseResults.push({ row: line, ok: false, plate, error: "DUPLICATED_PLATE_IN_FILE" });
          continue;
        }
        seenPlates.add(plate);

        const auction = auctionByPlate.get(plate);
        if (!auction) {
          parseResults.push({ row: line, ok: false, plate, error: "PLATE_NOT_IN_EVENT_LOT" });
          continue;
        }

        stagedBids.push({
          id_auction: auction.id_auction,
          tp_auction: auction.tp_auction,
          value: amount,
          plate,
          row: line,
        });
      }

      if (!stagedBids.length) {
        return res.status(400).json({ ok: false, error: "NO_VALID_OFFERS", results: parseResults });
      }

      const sealedAuctionIds = stagedBids
        .filter((row) => row.tp_auction === "SEALED_BID")
        .map((row) => row.id_auction);

      const existingByAuction = new Set();
      if (sealedAuctionIds.length) {
        const existingRows = await prisma.r_bid.findMany({
          where: {
            id_user: idUser,
            is_active: true,
            id_auction: { in: sealedAuctionIds },
          },
          select: { id_auction: true },
        });
        for (const row of existingRows) {
          existingByAuction.add(String(row.id_auction));
        }
      }

      const finalBids = [];
      for (const bid of stagedBids) {
        if (bid.tp_auction === "SEALED_BID" && existingByAuction.has(String(bid.id_auction))) {
          parseResults.push({ row: bid.row, ok: false, plate: bid.plate, error: "SEALED_BID_ALREADY_SUBMITTED" });
          continue;
        }
        finalBids.push(bid);
      }

      if (!finalBids.length) {
        return res.status(409).json({ ok: false, error: "NO_OFFERS_ACCEPTED", results: parseResults });
      }

      const created = await prisma.$transaction(async (tx) => {
        const createdRows = [];
        for (const bid of finalBids) {
          const row = await tx.r_bid.create({
            data: {
              id_auction: bid.id_auction,
              id_user: idUser,
              value: bid.value,
              is_active: true,
              additional: {
                source: "buyer_excel_upload",
                id_event: String(idEvent),
                id_company: String(companyId),
                plate: bid.plate,
              },
            },
            select: {
              id_bid: true,
              id_auction: true,
              value: true,
            },
          });
          createdRows.push({ ...row, row: bid.row, plate: bid.plate, ok: true });
        }
        return createdRows;
      });

      audit({
        req,
        action: "BUYER_BID_BULK_UPLOAD",
        entity: "r_bid",
        entityId: null,
        data: {
          id_event: String(idEvent),
          id_company: String(companyId),
          id_user: String(idUser),
          created_count: created.length,
          failed_count: parseResults.length,
          file_name: req.file.originalname,
        },
      });

      return res.status(201).json({
        ok: true,
        data: {
          id_event: String(idEvent),
          id_company: String(companyId),
          id_user: String(idUser),
          summary: {
            total_rows: Math.max(0, sheet.rowCount - 1),
            created: created.length,
            failed: parseResults.length,
          },
          results: [...created, ...parseResults],
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

router.use(
  "/r_bid",
  createCrudRouter({
    model: "r_bid",
    idField: "id_bid",
    requireAuth,
    ownershipCheck: true, // Enable ownership validation
  })
);

router.use(
  "/r_company",
  createCrudRouter({
    model: "r_company",
    idField: "id_company",
    requireAuth,
  })
);

router.use(
  "/r_connection",
  createCrudRouter({
    model: "r_connection",
    idField: "id_connection",
    requireAuth,
  })
);

// Middleware: non-admin users only see events their company is invited to
// Middleware: non-admin users only see/modify events their company is invited to
async function eventCompanyFilter(req, res, next) {
  const isAdmin = req.auth?.isAdmin === true;
  if (isAdmin) return next(); // admins have full access

  // Non-admins cannot create/update/delete events
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return res.status(403).json({ ok: false, error: "FORBIDDEN", message: "Solo los administradores pueden modificar eventos" });
  }

  try {
    const activeInvitations = await prisma.r_invitation.count({
      where: { is_active: true },
    });

    // Bootstrap mode: if there are no active invitations yet, keep events visible.
    if (activeInvitations === 0) return next();

    const companyId = req.auth?.companyId;
    if (!companyId) {
      // Invitations exist, but user has no company assigned → no visible events
      req.ownershipFilter = { id_event: { equals: BigInt(-1) } };
      return next();
    }

    const id = BigInt(companyId);
    req.ownershipFilter = {
      r_invitation: {
        some: {
          id_company: id,
          is_active: true,
        },
      },
    };
    next();
  } catch (error) {
    next(error);
  }
}

router.use(
  "/r_event",
  requireAuth,
  eventCompanyFilter,
  createCrudRouter({
    model: "r_event",
    idField: "id_event",
    requireAuth: null, // requireAuth applied above
  })
);

router.use(
  "/r_invitation",
  createCrudRouter({
    model: "r_invitation",
    idField: "id_invitation",
    requireAuth,
    softDelete: false, // hard delete to allow re-inviting same company
  })
);

router.get(
  "/r_log/audit-trail",
  requireAuth,
  requireModuleAccess("r_log", "read"),
  async (req, res, next) => {
    try {
      const takeRaw = Number.parseInt(String(req.query.take || "100"), 10);
      const skipRaw = Number.parseInt(String(req.query.skip || "0"), 10);
      const take = Number.isFinite(takeRaw) ? Math.min(Math.max(takeRaw, 1), 500) : 100;
      const skip = Number.isFinite(skipRaw) ? Math.max(skipRaw, 0) : 0;

      const actorId = String(req.query.actorId || "").trim();
      const actorLogin = String(req.query.actorLogin || "").trim();
      const action = String(req.query.action || "").trim();

      const andWhere = [];
      if (actorId) {
        andWhere.push({
          log: {
            path: ["actor", "id_user"],
            equals: actorId,
          },
        });
      }

      if (actorLogin) {
        andWhere.push({
          log: {
            path: ["actor", "login"],
            equals: actorLogin,
          },
        });
      }

      if (action) {
        andWhere.push({
          tp_log: {
            contains: action,
            mode: "insensitive",
          },
        });
      }

      const where = andWhere.length ? { AND: andWhere } : {};

      const [rows, total] = await Promise.all([
        prisma.r_log.findMany({
          where,
          orderBy: [
            { ins_at: "desc" },
            { id_log: "desc" },
          ],
          take,
          skip,
        }),
        prisma.r_log.count({ where }),
      ]);

      return res.json(jsonSafe({
        ok: true,
        data: rows,
        meta: {
          total,
          take,
          skip,
          hasMore: skip + rows.length < total,
        },
      }));
    } catch (err) {
      return next(err);
    }
  }
);

router.use(
  "/r_log",
  createCrudRouter({
    model: "r_log",
    idField: "id_log",
    hasIsActive: false,
    softDelete: false,
    requireAuth,
    allowCreate: false,
    allowUpdate: false,
    allowDelete: false,
  })
);

router.use(
  "/r_module",
  createCrudRouter({
    model: "r_module",
    idField: "id_module",
    requireAuth,
  })
);

router.use(
  "/r_role",
  createCrudRouter({
    model: "r_role",
    idField: "id_role",
    requireAuth,
  })
);

router.use(
  "/r_user",
  userRoutes
);

module.exports = router;
