describe('setup.service', () => {
  function loadService({
    prismaCountImpl,
    setupStateJson,
    setupStateUserCount = 0,
  } = {}) {
    jest.resetModules();

    const countMock = jest.fn(prismaCountImpl || (() => Promise.resolve(0)));

    jest.doMock('../src/db/prisma', () => ({
      prisma: {
        r_user: {
          count: (...args) => countMock(...args),
        },
      },
    }));

    jest.doMock('node:fs/promises', () => ({
      readFile: jest.fn(async () => {
        if (!setupStateJson) {
          const err = new Error('missing');
          err.code = 'ENOENT';
          throw err;
        }
        return setupStateJson;
      }),
      writeFile: jest.fn(async () => undefined),
    }));

    const tmpCountMock = jest.fn(async () => setupStateUserCount);
    const disconnectMock = jest.fn(async () => undefined);

    jest.doMock('@prisma/client', () => ({
      PrismaClient: class {
        constructor() {
          this.r_user = { count: (...args) => tmpCountMock(...args) };
        }

        async $disconnect() {
          return disconnectMock();
        }
      },
    }));

    const service = require('../src/setup/setup.service');

    return {
      ...service,
      countMock,
      tmpCountMock,
      disconnectMock,
    };
  }

  test('isSystemConfigured returns true when primary prisma has users', async () => {
    const svc = loadService({
      prismaCountImpl: async () => 2,
    });

    const configured = await svc.isSystemConfigured();

    expect(configured).toBe(true);
  });

  test('isSystemConfigured returns false when no db and no setup state', async () => {
    const svc = loadService({
      prismaCountImpl: async () => {
        throw new Error('db offline');
      },
      setupStateJson: null,
    });

    const configured = await svc.isSystemConfigured();

    expect(configured).toBe(false);
  });

  test('isSystemConfigured uses setup-state fallback when available', async () => {
    const svc = loadService({
      prismaCountImpl: async () => {
        throw new Error('db offline');
      },
      setupStateJson: JSON.stringify({ databaseUrl: 'postgresql://u:p@localhost:5432/db?schema=showdeal' }),
      setupStateUserCount: 1,
    });

    const configured = await svc.isSystemConfigured();

    expect(configured).toBe(true);
    expect(svc.tmpCountMock).toHaveBeenCalledTimes(1);
    expect(svc.disconnectMock).toHaveBeenCalledTimes(1);
  });

  test('bootstrapInitialSetup rejects when system is already configured', async () => {
    const svc = loadService({
      prismaCountImpl: async () => 1,
    });

    await expect(
      svc.bootstrapInitialSetup({
        dbHost: 'localhost',
        dbPort: 5432,
        installerUser: 'postgres',
        installerPassword: 'postgres',
        dbName: 'showdeal',
        appDbUser: 'showdeal',
        appDbPassword: 'secret',
        companyName: 'ShowDeal',
        adminName: 'Admin',
        adminUser: 'admin',
        adminPassword: 'Password123!',
      })
    ).rejects.toMatchObject({
      message: 'SYSTEM_ALREADY_CONFIGURED',
      status: 409,
    });
  });
});
