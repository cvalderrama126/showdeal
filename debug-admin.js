const { prisma } = require('./src/db/prisma');

(async () => {
  try {
    const admin = await prisma.r_user.findFirst({
      where: { user_1: 'admin' },
      select: { 
        id_user: true, 
        user_1: true, 
        name: true, 
        authentication: true, 
        r_role: { select: { role: true } } 
      }
    });
    
    console.log('=== ADMIN USER ===');
    console.log(JSON.stringify(admin, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
    
    if (admin && admin.authentication) {
      const latest = admin.authentication[admin.authentication.length - 1];
      console.log('\n=== LATEST AUTHENTICATION ===');
      console.log(JSON.stringify(latest, null, 2));
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
