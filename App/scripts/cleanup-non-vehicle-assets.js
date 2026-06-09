/* eslint-disable no-console */
const { prisma } = require("../src/db/prisma");

function isVehicleType(value) {
  const text = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  if (!text) return false;
  return text === "VEHICLE" || text.includes("VEHIC") || text === "CAR" || text === "AUTO" || text === "TRUCK" || text === "MOTORCYCLE";
}

function hasCompleteVehicleMetadata(additional) {
  const info = additional && typeof additional === "object" ? additional : {};
  const marca = String(info.marca ?? info.brand ?? "").trim();
  const modelo = String(info.modelo ?? info.model ?? "").trim();
  const anio = Number.parseInt(String(info.anio ?? info.year ?? "").trim(), 10);
  return !!marca && !!modelo && Number.isInteger(anio);
}

async function main() {
  const apply = process.argv.includes("--apply");

  const rows = await prisma.r_asset.findMany({
    select: {
      id_asset: true,
      uin: true,
      tp_asset: true,
      is_active: true,
      status: true,
      additional: true,
    },
  });

  const nonVehicle = rows.filter((row) => !isVehicleType(row.tp_asset));
  const incompleteVehicle = rows.filter(
    (row) => isVehicleType(row.tp_asset) && !hasCompleteVehicleMetadata(row.additional)
  );
  const vehicle = rows.filter((row) => isVehicleType(row.tp_asset) && hasCompleteVehicleMetadata(row.additional));

  console.log("Total assets:", rows.length);
  console.log("Vehicle candidates:", vehicle.length);
  console.log("Non-vehicle candidates:", nonVehicle.length);
  console.log("Incomplete vehicle candidates:", incompleteVehicle.length);

  const toDeactivate = [...nonVehicle, ...incompleteVehicle];

  if (!toDeactivate.length) {
    console.log("Nothing to clean.");
    return;
  }

  const ids = toDeactivate.map((row) => row.id_asset);
  const preview = toDeactivate.slice(0, 20).map((row) => ({
    id_asset: String(row.id_asset),
    uin: row.uin,
    tp_asset: row.tp_asset,
    is_active: row.is_active,
    has_complete_metadata: hasCompleteVehicleMetadata(row.additional),
  }));

  console.log("Preview (up to 20):", preview);

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to deactivate non-vehicle assets.");
    return;
  }

  const result = await prisma.r_asset.updateMany({
    where: { id_asset: { in: ids } },
    data: {
      is_active: false,
      status: "ARCHIVED",
    },
  });

  console.log("Updated rows:", result.count);
}

main()
  .catch((err) => {
    console.error("Cleanup failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
