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
  const assetBrand = getStringFromAdditional(assetAdditional, ["brand", "marca", "make"]);
  const assetModel = getStringFromAdditional(assetAdditional, ["model", "modelo"]);
  const eventStatus = resolveEventStatus(auction?.r_event);

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
      res.setHeader("Content-Disposition", `attachment; filename=\"${fileName}\"`);
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
            starting_bid: true,
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

      return {
        id_asset: row.r_asset?.id_asset,
        tp_asset: row.r_asset?.tp_asset,
        id_auction: row.id_auction,
        tp_auction: tpAuction,
        id_event: row.r_event?.id_event,
        event_status: eventStatus,
        current_offer: currentOffer,
        my_offer: myBid,
        already_bid: alreadyBid,
        can_bid: canBid,
      };
    });

    return res.json({ ok: true, data: jsonSafe(data) });
  } catch (err) {
    return next(err);
  }
});

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
