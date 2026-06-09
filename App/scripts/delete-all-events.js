/* eslint-disable no-console */
const { prisma } = require("../src/db/prisma");

async function main() {
  const before = await prisma.r_event.count();

  const deletedInvitations = await prisma.r_invitation.deleteMany({});
  const deletedAuctions = await prisma.r_auction.deleteMany({});
  const deletedEvents = await prisma.r_event.deleteMany({});

  const after = await prisma.r_event.count();

  console.log("Events before:", before);
  console.log("Deleted invitations:", deletedInvitations.count);
  console.log("Deleted auctions:", deletedAuctions.count);
  console.log("Deleted events:", deletedEvents.count);
  console.log("Events after:", after);
}

main()
  .catch((err) => {
    console.error("delete-all-events failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
