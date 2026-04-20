const { prisma } = require("./src/db/prisma");

async function checkEvents() {
  try {
    const now = new Date();
    console.log("Current time:", now.toISOString());
    console.log("\n=== All Active Events ===\n");

    const events = await prisma.r_event.findMany({
      where: { is_active: true },
      select: {
        id_event: true,
        tp_event: true,
        start_at: true,
        end_at: true,
        is_active: true,
      },
    });

    for (const event of events) {
      const startAt = new Date(event.start_at);
      const endAt = new Date(event.end_at);
      const status =
        now < startAt
          ? "PROGRAMADO (no started yet)"
          : now > endAt
            ? "CERRADO (expired)"
            : "VIGENTE (active)";

      console.log(
        `Event #${event.id_event}: ${event.tp_event}`
      );
      console.log(`  Status: ${status}`);
      console.log(`  Start: ${startAt.toISOString()}`);
      console.log(`  End:   ${endAt.toISOString()}`);
      console.log();
    }

    console.log("\n=== Active Auctions ===\n");
    const auctions = await prisma.r_auction.findMany({
      where: { is_active: true },
      include: {
        r_event: {
          select: {
            id_event: true,
            tp_event: true,
            start_at: true,
            end_at: true,
          },
        },
        r_asset: {
          select: {
            id_asset: true,
            tp_asset: true,
          },
        },
      },
      take: 10,
    });

    for (const auction of auctions) {
      console.log(
        `Auction #${auction.id_auction} (${auction.tp_auction}): Asset #${auction.id_asset} (${auction.r_asset?.tp_asset})`
      );
      if (auction.r_event) {
        const startAt = new Date(auction.r_event.start_at);
        const endAt = new Date(auction.r_event.end_at);
        const status =
          now < startAt
            ? "PROGRAMADO"
            : now > endAt
              ? "CERRADO"
              : "VIGENTE";
        console.log(`  Event #${auction.r_event.id_event}: ${auction.r_event.tp_event} (${status})`);
      }
      console.log();
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

checkEvents();
