// Query users from database
const { prisma } = require('../src/db/prisma');

async function getUsers() {
  try {
    const users = await prisma.r_user.findMany({
      select: {
        id_user: true,
        user_1: true,
        name: true,
        is_active: true,
        r_role: {
          select: {
            role: true
          }
        }
      },
      take: 10
    });

    console.log('📋 Usuarios en la BD:');
    console.log('='.repeat(80));
    
    if (users.length === 0) {
      console.log('❌ No hay usuarios en la BD. Debes crear uno.');
    } else {
      users.forEach((user, i) => {
        console.log(`${i + 1}. Username: ${user.user_1 || 'N/A'}`);
        console.log(`   Nombre: ${user.name}`);
        console.log(`   Rol: ${user.r_role?.role || 'N/A'}`);
        console.log(`   Activo: ${user.is_active ? '✅ Sí' : '❌ No'}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

getUsers();