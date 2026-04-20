const { prisma } = require("../db/prisma");

// Core modules backed by API/Frontend and managed through r_module/r_access
const CORE_MODULES = [
  { module: "r_access", is_admin: true },
  { module: "r_asset", is_admin: false },
  { module: "r_attach", is_admin: false },
  { module: "r_auction", is_admin: false },
  { module: "r_bid", is_admin: false },
  { module: "r_company", is_admin: true },
  { module: "r_connection", is_admin: false },
  { module: "r_event", is_admin: false },
  { module: "r_invitation", is_admin: false },
  { module: "r_log", is_admin: true },
  { module: "r_module", is_admin: true },
  { module: "r_role", is_admin: true },
  { module: "r_ui_theme", is_admin: true },
  { module: "r_user", is_admin: true },
];

async function ensureCoreModules() {
  for (const core of CORE_MODULES) {
    const existing = await prisma.r_module.findFirst({
      where: { module: core.module },
      select: { id_module: true },
    });

    if (existing) continue;

    await prisma.r_module.create({
      data: {
        module: core.module,
        is_admin: core.is_admin === true,
        is_active: true,
        additional: { seeded: true, source: "core-module-catalog" },
      },
    });
  }
}

module.exports = { CORE_MODULES, ensureCoreModules };
