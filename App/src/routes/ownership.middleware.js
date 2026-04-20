// src/routes/ownership.middleware.js
const { prisma } = require("../db/prisma");

/**
 * Middleware to check ownership of resources
 * Prevents IDOR (Insecure Direct Object Reference) attacks
 */
function requireOwnership(model, ownershipField) {
  return async (req, res, next) => {
    try {
      // Admins bypass ownership checks
      if (req.auth && req.auth.isAdmin) return next();

      const id = req.params.id;
      if (!id) return next(); // Skip if no ID parameter

      const resourceId = BigInt(id);
      const userId = req.auth.sub;

      let ownershipCheck = false;

      switch (model) {
        case 'r_user':
          // Users can only access users from their own company
          const userCompany = await prisma.r_user.findUnique({
            where: { id_user: userId },
            select: { id_company: true }
          });

          if (!userCompany) {
            return res.status(403).json({ ok: false, error: "USER_NOT_FOUND" });
          }

          const targetUser = await prisma.r_user.findUnique({
            where: { id_user: resourceId },
            select: { id_company: true }
          });

          ownershipCheck = targetUser && targetUser.id_company === userCompany.id_company;
          break;

        case 'r_bid':
          // Users can only access their own bids
          const bid = await prisma.r_bid.findUnique({
            where: { id_bid: resourceId },
            select: { id_user: true }
          });

          ownershipCheck = bid && bid.id_user === userId;
          break;

        case 'r_asset':
          // Users can only access assets connected to their company
          const userConnections = await prisma.r_connection.findMany({
            where: { id_company: req.auth.companyId || 0 },
            select: { id_asset: true }
          });

          const connectedAssetIds = userConnections.map(conn => conn.id_asset);
          ownershipCheck = connectedAssetIds.includes(resourceId);
          break;

        case 'r_attach':
          // Users can only access attachments of assets they can access
          const attachment = await prisma.r_attach.findUnique({
            where: { id_attach: resourceId },
            select: { id_asset: true }
          });

          if (attachment) {
            // Reuse asset ownership check
            const assetCheck = await requireOwnership('r_asset')(req, res, () => true);
            ownershipCheck = assetCheck === true;
          }
          break;

        case 'r_auction':
          // Users can only access auctions of assets they can access
          const auction = await prisma.r_auction.findUnique({
            where: { id_auction: resourceId },
            select: { id_asset: true }
          });

          if (auction) {
            req.params.id = auction.id_asset.toString();
            const assetCheck = await requireOwnership('r_asset')(req, res, () => true);
            req.params.id = id; // Restore original ID
            ownershipCheck = assetCheck === true;
          }
          break;

        default:
          // For other models, allow access (admin-only models)
          ownershipCheck = true;
          break;
      }

      if (!ownershipCheck) {
        return res.status(403).json({
          ok: false,
          error: "ACCESS_DENIED",
          message: "You don't have permission to access this resource"
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware to filter list queries by ownership
 * Adds WHERE clauses to ensure users only see their own data
 */
function filterByOwnership(model) {
  return async (req, res, next) => {
    try {
      // Admins bypass ownership filters
      if (req.auth && req.auth.isAdmin) return next();

      const userId = req.auth.sub;

      // Add ownership filters to the query
      switch (model) {
        case 'r_user':
          // Filter users by company
          const userCompany = await prisma.r_user.findUnique({
            where: { id_user: userId },
            select: { id_company: true }
          });

          if (userCompany) {
            req.ownershipFilter = { id_company: userCompany.id_company };
          }
          break;

        case 'r_bid':
          // Filter bids by user
          req.ownershipFilter = { id_user: userId };
          break;

        case 'r_asset':
          // Filter assets by company connections
          const userConnections = await prisma.r_connection.findMany({
            where: { id_company: req.auth.companyId || 0 },
            select: { id_asset: true }
          });

          const connectedAssetIds = userConnections.map(conn => conn.id_asset);
          if (connectedAssetIds.length > 0) {
            req.ownershipFilter = { id_asset: { in: connectedAssetIds } };
          } else {
            req.ownershipFilter = { id_asset: -1 }; // No access to any assets
          }
          break;

        case 'r_attach':
          // Filter attachments by accessible assets
          const attachConnections = await prisma.r_connection.findMany({
            where: { id_company: req.auth.companyId || 0 },
            select: { id_asset: true }
          });

          const attachAssetIds = attachConnections.map(conn => conn.id_asset);
          if (attachAssetIds.length > 0) {
            req.ownershipFilter = { id_asset: { in: attachAssetIds } };
          } else {
            req.ownershipFilter = { id_asset: -1 };
          }
          break;

        case 'r_auction':
          // Filter auctions by accessible assets
          const auctionConnections = await prisma.r_connection.findMany({
            where: { id_company: req.auth.companyId || 0 },
            select: { id_asset: true }
          });

          const auctionAssetIds = auctionConnections.map(conn => conn.id_asset);
          if (auctionAssetIds.length > 0) {
            req.ownershipFilter = { id_asset: { in: auctionAssetIds } };
          } else {
            req.ownershipFilter = { id_asset: -1 };
          }
          break;

        default:
          // No ownership filter for admin models
          break;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireOwnership, filterByOwnership };