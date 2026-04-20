const { Prisma } = require('@prisma/client');

function show(modelName) {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === modelName);
  console.log(`\n=== ${modelName} ===`);
  for (const f of m.fields) {
    console.log([
      f.name,
      `kind=${f.kind}`,
      `type=${f.type}`,
      `isId=${f.isId}`,
      `isReadOnly=${f.isReadOnly}`,
      `isUpdatedAt=${f.isUpdatedAt}`,
      `relationFromFields=${JSON.stringify(f.relationFromFields || [])}`,
    ].join(' | '));
  }
}

['r_access','r_connection','r_auction','r_bid','r_invitation','r_module'].forEach(show);
