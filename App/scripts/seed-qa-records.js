const { prisma } = require('../src/db/prisma');

async function getOrCreateBaseRecords(runId) {
  let company = await prisma.r_company.findFirst({ where: { is_active: true } });
  if (!company) {
    company = await prisma.r_company.create({
      data: {
        uin: `QA-COMP-${runId}`,
        company: `QA Company ${runId}`,
        is_active: true,
        additional: { qa_seed: true, runId },
      },
    });
  }

  let role = await prisma.r_role.findFirst({ where: { is_active: true } });
  if (!role) {
    role = await prisma.r_role.create({
      data: {
        role: `QA_ROLE_${runId}`,
        is_active: true,
        additional: { qa_seed: true, runId },
      },
    });
  }

  let user = await prisma.r_user.findFirst({ where: { is_active: true } });
  if (!user) {
    user = await prisma.r_user.create({
      data: {
        id_company: company.id_company,
        id_role: role.id_role,
        uin: `QA-USER-${runId}`,
        user_1: `qa_user_${runId}`,
        name: `QA User ${runId}`,
        is_active: true,
        authentication: [
          {
            password: '$2b$12$SeIZZ4L3sRW12.2vnfqVNer5euiIP20zqDfnPj5Y1hJXmMjKKUBbq',
            created: new Date().toISOString(),
            algorithm: 'bcrypt',
          },
        ],
        additional: { qa_seed: true, runId },
      },
    });
  }

  return { company, role, user };
}

async function seedAll() {
  const runId = Date.now();
  const { company, role, user } = await getOrCreateBaseRecords(runId);

  const asset = await prisma.r_asset.create({
    data: {
      uin: `QA-ASSET-${runId}`,
      tp_asset: 'VEHICLE',
      status: 'AVAILABLE',
      location_city: 'Bogota',
      location_address: `QA Street ${runId}`,
      is_active: true,
      additional: { qa_seed: true, runId },
    },
  });

  const event = await prisma.r_event.create({
    data: {
      tp_event: `QA_EVENT_${runId}`,
      start_at: new Date(Date.now() + 3600 * 1000),
      end_at: new Date(Date.now() + 7200 * 1000),
      is_active: true,
      additional: { qa_seed: true, runId },
    },
  });

  const moduleRec = await prisma.r_module.create({
    data: {
      module: `qa_module_${runId}`,
      is_admin: false,
      is_active: true,
      additional: { qa_seed: true, runId },
    },
  });

  const access = await prisma.r_access.create({
    data: {
      id_module: moduleRec.id_module,
      id_role: role.id_role,
      is_insert: true,
      is_update: true,
      is_delete: true,
      is_active: true,
      additional: { qa_seed: true, runId },
    },
  });

  const connection = await prisma.r_connection.create({
    data: {
      id_company: company.id_company,
      id_asset: asset.id_asset,
      tp_connection: 'OWNER',
      is_active: true,
      additional: { qa_seed: true, runId },
    },
  });

  const auction = await prisma.r_auction.create({
    data: {
      tp_auction: 'LIVE_AUCTION',
      id_event: event.id_event,
      id_asset: asset.id_asset,
      is_active: true,
      additional: { qa_seed: true, runId },
    },
  });

  const bid = await prisma.r_bid.create({
    data: {
      id_auction: auction.id_auction,
      id_user: user.id_user,
      value: '1000.00',
      is_active: true,
      additional: { qa_seed: true, runId },
    },
  });

  const invitation = await prisma.r_invitation.create({
    data: {
      id_event: event.id_event,
      id_user: user.id_user,
      is_active: true,
      additional: { qa_seed: true, runId },
    },
  });

  const attach = await prisma.r_attach.create({
    data: {
      id_asset: asset.id_asset,
      tp_attach: 'PHOTO',
      file_name: `qa_${runId}.txt`,
      mime_type: 'text/plain',
      file_size_bytes: BigInt(4),
      file_hash: `qa_hash_${runId}`,
      file_content: Buffer.from('seed'),
      is_active: true,
      additional: { qa_seed: true, runId },
    },
  });

  const log = await prisma.r_log.create({
    data: {
      tp_log: 'QA',
      log: { qa_seed: true, runId, message: 'QA seed record' },
    },
  });

  return {
    runId,
    ids: {
      company: String(company.id_company),
      role: String(role.id_role),
      user: String(user.id_user),
      asset: String(asset.id_asset),
      event: String(event.id_event),
      module: String(moduleRec.id_module),
      access: String(access.id_access),
      connection: String(connection.id_connection),
      auction: String(auction.id_auction),
      bid: String(bid.id_bid),
      invitation: String(invitation.id_invitation),
      attach: String(attach.id_attach),
      log: String(log.id_log),
    },
  };
}

seedAll()
  .then((result) => {
    console.log('QA seed completado');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error('Error al poblar QA seed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
