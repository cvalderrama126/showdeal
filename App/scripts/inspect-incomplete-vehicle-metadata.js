/* eslint-disable no-console */
const { prisma } = require("../src/db/prisma");

(async () => {
  const rows = await prisma.r_asset.findMany({
    where: { is_active: true },
    select: {
      id_asset: true,
      uin: true,
      tp_asset: true,
      status: true,
      additional: true,
    },
    orderBy: { id_asset: "asc" },
  });

  const normalized = rows.map((row) => {
    const add = row.additional && typeof row.additional === "object" ? row.additional : {};
    const marca = String(add.marca ?? add.brand ?? "").trim();
    const modelo = String(add.modelo ?? add.model ?? "").trim();
    const anioRaw = add.anio ?? add.year ?? "";
    const anio = Number.parseInt(String(anioRaw).trim(), 10);

    return {
      id_asset: String(row.id_asset),
      uin: row.uin,
      tp_asset: row.tp_asset,
      status: row.status,
      marca,
      modelo,
      anio: Number.isInteger(anio) ? anio : null,
      complete: !!marca && !!modelo && Number.isInteger(anio),
    };
  });

  const incomplete = normalized.filter((item) => !item.complete);

  console.log("Active assets:", normalized.length);
  console.log("Incomplete metadata:", incomplete.length);
  console.log(incomplete);

  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
