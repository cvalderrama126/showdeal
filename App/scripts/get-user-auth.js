// Get user authentication details
const { prisma } = require('../src/db/prisma');

async function getUserAuth() {
  try {
    const user = await prisma.r_user.findFirst({
      where: {
        user_1: 'system'
      },
      select: {
        id_user: true,
        user_1: true,
        name: true,
        authentication: true,
        r_role: {
          select: {
            role: true
          }
        }
      }
    });

    if (!user) {
      console.log('❌ Usuario "system" no encontrado');
      return;
    }

    console.log('✅ Usuario encontrado:');
    console.log('='.repeat(80));
    console.log(`Username: ${user.user_1}`);
    console.log(`Nombre: ${user.name}`);
    console.log(`Rol: ${user.r_role?.role}`);
    console.log('');
    console.log('Autenticación (JSON):');
    console.log(JSON.stringify(user.authentication, null, 2));
    console.log('');
    console.log('='.repeat(80));
    console.log('');
    console.log('Para hacer login, intenta con:');
    console.log(`  Username: ${user.user_1}`);
    console.log('  Password: (verifica el JSON anterior)');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

getUserAuth();