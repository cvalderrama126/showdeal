'use strict';

jest.mock('../src/db/prisma', () => ({
  prisma: {
    r_connection: {
      findMany: jest.fn(),
    },
    r_attach: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    r_asset: {
      findMany: jest.fn(),
    },
  },
}));

const { prisma } = require('../src/db/prisma');
const { listAttachments, listAttachmentOptions } = require('../src/attachments/attachment.service');

describe('attachment.service ownership filters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.r_connection.findMany.mockResolvedValue([{ id_asset: 1n }]);
    prisma.r_attach.findMany.mockResolvedValue([]);
    prisma.r_attach.count.mockResolvedValue(0);
    prisma.r_asset.findMany.mockResolvedValue([]);
  });

  test('listAttachments does not allow non-admin id_asset filter to bypass company scope', async () => {
    await listAttachments({
      companyId: 10n,
      isAdmin: false,
      id_asset: '2',
      take: 10,
      skip: 0,
    });

    expect(prisma.r_attach.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id_asset: { in: [] },
          is_active: true,
        }),
      })
    );
  });

  test('listAttachments denies non-admin users without companyId', async () => {
    await listAttachments({
      companyId: null,
      isAdmin: false,
      take: 10,
      skip: 0,
    });

    expect(prisma.r_attach.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id_asset: { in: [] },
          is_active: true,
        }),
      })
    );
  });

  test('listAttachmentOptions filters attachment types by connected assets for non-admin users', async () => {
    await listAttachmentOptions({ companyId: 10n, isAdmin: false });

    expect(prisma.r_attach.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          is_active: true,
          id_asset: { in: [1n] },
        },
        distinct: ['tp_attach'],
      })
    );
  });
});