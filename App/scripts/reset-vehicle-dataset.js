/* eslint-disable no-console */
const { prisma } = require("../src/db/prisma");

function makeVehicle(index) {
  const plate = `SDV${String(index).padStart(3, "0")}`;
  const brandPool = ["Toyota", "Mazda", "Chevrolet", "Renault", "Kia"];
  const modelPool = ["Corolla", "CX-5", "Onix", "Duster", "Sportage"];

  const brand = brandPool[index % brandPool.length];
  const model = modelPool[index % modelPool.length];
  const year = 2016 + (index % 9);

  return {
    is_active: true,
    uin: plate,
    tp_asset: "VEHICLE",
    status: "REGISTERED",
    book_value: "0.00",
    appraised_value: "0.00",
    expected_value: "0.00",
    reserve_price: "0.00",
    starting_bid: "0.00",
    realized_value: "0.00",
    location_city: "Bogota",
    location_address: `Patio ${index + 1}`,
    version_number: 1,
    additional: {
      placa: plate,
      plate,
      marca: brand,
      brand,
      modelo: model,
      model,
      anio: year,
      year,
      source: "reset-vehicle-dataset",
    },
  };
}

async function main() {
  const assets = await prisma.r_asset.findMany({
    select: { id_asset: true },
  });
  const assetIds = assets.map((a) => a.id_asset);

  const auctions = assetIds.length
    ? await prisma.r_auction.findMany({
      where: { id_asset: { in: assetIds } },
      select: { id_auction: true, id_event: true },
    })
    : [];

  const auctionIds = auctions.map((a) => a.id_auction);
  const eventIds = [...new Set(auctions.map((a) => a.id_event))];

  const summary = await prisma.$transaction(async (tx) => {
    const deletedBids = auctionIds.length
      ? await tx.r_bid.deleteMany({ where: { id_auction: { in: auctionIds } } })
      : { count: 0 };

    const deletedInvitations = eventIds.length
      ? await tx.r_invitation.deleteMany({ where: { id_event: { in: eventIds } } })
      : { count: 0 };

    const deletedAuctions = auctionIds.length
      ? await tx.r_auction.deleteMany({ where: { id_auction: { in: auctionIds } } })
      : { count: 0 };

    const deletedConnections = assetIds.length
      ? await tx.r_connection.deleteMany({ where: { id_asset: { in: assetIds } } })
      : { count: 0 };

    const deletedAttachments = assetIds.length
      ? await tx.r_attach.deleteMany({ where: { id_asset: { in: assetIds } } })
      : { count: 0 };

    const deletedEvents = eventIds.length
      ? await tx.r_event.deleteMany({ where: { id_event: { in: eventIds } } })
      : { count: 0 };

    const deletedAssets = assetIds.length
      ? await tx.r_asset.deleteMany({ where: { id_asset: { in: assetIds } } })
      : { count: 0 };

    const createdAssets = await tx.r_asset.createMany({
      data: Array.from({ length: 20 }, (_, idx) => makeVehicle(idx + 1)),
    });

    return {
      deletedBids: deletedBids.count,
      deletedInvitations: deletedInvitations.count,
      deletedAuctions: deletedAuctions.count,
      deletedConnections: deletedConnections.count,
      deletedAttachments: deletedAttachments.count,
      deletedEvents: deletedEvents.count,
      deletedAssets: deletedAssets.count,
      createdAssets: createdAssets.count,
    };
  });

  const finalCounts = await Promise.all([
    prisma.r_asset.count(),
    prisma.r_asset.count({ where: { is_active: true, tp_asset: "VEHICLE" } }),
    prisma.r_event.count(),
    prisma.r_auction.count(),
  ]);

  console.log("Reset summary:", summary);
  console.log("Final counts:", {
    assetsTotal: finalCounts[0],
    assetsActiveVehicle: finalCounts[1],
    eventsTotal: finalCounts[2],
    auctionsTotal: finalCounts[3],
  });
}

main()
  .catch((err) => {
    console.error("reset-vehicle-dataset failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
