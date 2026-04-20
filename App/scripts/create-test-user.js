// Create a test user with known credentials
const { prisma } = require('../src/db/prisma');
const bcrypt = require('bcryptjs');

async function createTestUser() {
  try {
    const testPassword = 'password123';
    const hashedPassword = await bcrypt.hash(testPassword, 12);

    console.log('🔐 Creando usuario de prueba...');
    console.log('='.repeat(80));

    // Get ADMIN role
    const adminRole = await prisma.r_role.findFirst({
      where: {
        role: 'Root'
      }
    });

    if (!adminRole) {
      console.log('❌ Rol "Root" no encontrado');
      return;
    }

    // Get first company
    const company = await prisma.r_company.findFirst();

    if (!company) {
      console.log('❌ No hay compañías en la BD. Por favor crea una primero.');
      return;
    }

    // Create user
    const newUser = await prisma.r_user.create({
      data: {
        user_1: 'testuser',
        name: 'Test User',
        uin: 'TEST-' + Date.now(),
        id_role: adminRole.id_role,
        id_company: company.id_company,
        is_active: true,
        authentication: [
          {
            password: hashedPassword,
            created: new Date().toISOString(),
            migrated_from_sha256: false
          }
        ]
      }
    });

    console.log('✅ Usuario creado exitosamente!');
    console.log('');
    console.log('📝 CREDENCIALES PARA LOGIN:');
    console.log('='.repeat(80));
    console.log(`Username: testuser`);
    console.log(`Password: ${testPassword}`);
    console.log('');
    console.log('🧪 Puedes usar estas credenciales para probar la aplicación.');

  } catch (error) {
    if (error.code === 'P2002') {
      console.log('❌ El usuario "testuser" ya existe.');
    } else {
      console.error('Error:', error.message);
    }
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();