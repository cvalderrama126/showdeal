/* eslint-disable no-console */
const { prisma } = require("../src/db/prisma");

(async () => {
  const lastEvent = await prisma.r_event.findFirst({
    orderBy: { id_event: "desc" },
    select: { id_event: true, tp_event: true },
  });

  if (!lastEvent) {
    console.log({ lastEvent: null, auctionsForEvent: 0, invitationsForEvent: 0 });
    await prisma.$disconnect();
    return;
  }

  const [auctionsForEvent, invitationsForEvent] = await Promise.all([
    prisma.r_auction.count({ where: { id_event: lastEvent.id_event } }),
    prisma.r_invitation.count({ where: { id_event: lastEvent.id_event, is_active: true } }),
  ]);

  console.log({
    lastEvent: {
      id_event: String(lastEvent.id_event),
      tp_event: lastEvent.tp_event,
    },
    auctionsForEvent,
    invitationsForEvent,
  });

  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
