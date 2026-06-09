/* eslint-disable no-console */
const { prisma } = require("../src/db/prisma");

(async () => {
  const events = await prisma.r_event.count();
  const auctions = await prisma.r_auction.count();
  const invitations = await prisma.r_invitation.count();
  console.log({ events, auctions, invitations });
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
