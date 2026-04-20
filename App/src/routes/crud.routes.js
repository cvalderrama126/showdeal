const router = require("express").Router();
const { createCrudRouter } = require("./crud.factory");
const { requireAuth } = require("../auth/auth.middleware");
const { prisma } = require("../db/prisma");
const { jsonSafe } = require("./jsonSafe");
const { audit } = require("../utils/audit.service");
const attachmentRoutes = require("../attachments/attachment.routes");
const userRoutes = require("../users/user.routes");
const assetBulkRoutes = require("../assets/asset-bulk.routes");

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
  "/r_auction/:id_auction/bid",
  requireAuth,
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
