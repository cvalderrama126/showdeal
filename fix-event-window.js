const { prisma } = require("./src/db/prisma");

async function fixEventWindow() {
  try {
    const now = new Date();
    const startAt = new Date(now);
    startAt.setMinutes(startAt.getMinutes() - 30); // Started 30 mins ago
    
    const endAt = new Date(now);
    endAt.setHours(endAt.getHours() + 2); // Ends in 2 hours

    console.log("Updating event #5 to be VIGENTE (active now):");
    console.log(`  Current time: ${now.toISOString()}`);
    console.log(`  Start at: ${startAt.toISOString()}`);
    console.log(`  End at:   ${endAt.toISOString()}`);

    const updated = await prisma.r_event.update({
      where: { id_event: 5n },
      data: {
        start_at: startAt,
        end_at: endAt,
      },
    });

    console.log("\n✅ Event updated successfully!");

    // Check all auctions for event #5
    const auctions = await prisma.r_auction.findMany({
      where: {
        id_event: 5n,
        is_active: true,
      },
      include: {
        r_asset: { select: { id_asset: true, tp_asset: true } },
      },
    });

    console.log(`\n${auctions.length} auctions active for event #5:`);
    for (const a of auctions) {
      console.log(`  - Auction #${a.id_auction}: Asset #${a.id_asset} (${a.r_asset?.tp_asset})`);
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

fixEventWindow();
