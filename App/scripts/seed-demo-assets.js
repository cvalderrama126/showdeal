const { prisma } = require('../src/db/prisma');

const assets = [
  { uin: 'ACT-001', tp_asset: 'Inmueble', status: 'Disponible', book_value: 150000, appraised_value: 180000, expected_value: 170000, reserve_price: 120000, starting_bid: 100000, realized_value: 0, location_city: 'Bogotá', location_address: 'Calle 100 # 15-20' },
  { uin: 'ACT-002', tp_asset: 'Vehículo', status: 'Disponible', book_value: 45000, appraised_value: 50000, expected_value: 48000, reserve_price: 35000, starting_bid: 30000, realized_value: 0, location_city: 'Medellín', location_address: 'Carrera 70 # 45-10' },
  { uin: 'ACT-003', tp_asset: 'Maquinaria', status: 'En proceso', book_value: 90000, appraised_value: 95000, expected_value: 92000, reserve_price: 70000, starting_bid: 60000, realized_value: 0, location_city: 'Cali', location_address: 'Avenida 6N # 23-44' },
  { uin: 'ACT-004', tp_asset: 'Inmueble', status: 'Adjudicado', book_value: 220000, appraised_value: 250000, expected_value: 240000, reserve_price: 180000, starting_bid: 150000, realized_value: 195000, location_city: 'Barranquilla', location_address: 'Carrera 54 # 72-30' },
  { uin: 'ACT-005', tp_asset: 'Equipo', status: 'Disponible', book_value: 18000, appraised_value: 20000, expected_value: 19000, reserve_price: 12000, starting_bid: 10000, realized_value: 0, location_city: 'Bogotá', location_address: 'Calle 13 # 37-70' },
];

async function main() {
  for (const a of assets) {
    const r = await prisma.r_asset.create({ data: a });
    console.log(`Created asset id=${r.id_asset} uin=${r.uin}`);
  }
  console.log('Done.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
