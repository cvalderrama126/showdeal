// Reset passwords and create test users with different profiles
const { prisma } = require('../src/db/prisma');
const bcrypt = require('bcryptjs');

async function setupTestUsers() {
  try {
    console.log('🔐 Configurando usuarios de prueba...');
    console.log('='.repeat(80));

    // Get all roles
    const roles = await prisma.r_role.findMany();
    console.log(`\n📋 Roles disponibles: ${roles.map(r => r.role).join(', ')}`);

    // Get first company
    const company = await prisma.r_company.findFirst();
    if (!company) {
      console.log('❌ No hay compañías en la BD.');
      return;
    }

    const testPassword = 'password123';
    const hashedPassword = await bcrypt.hash(testPassword, 12);

    const testUsers = [
      { username: 'admin', name: 'Admin User', role: 'Root' },
      { username: 'supervisor', name: 'Supervisor User', role: 'Supervisor' },
      { username: 'auctioneer', name: 'Auctioneer User', role: 'Auctioneer' },
      { username: 'buyer', name: 'Buyer User', role: 'Buyer' },
      { username: 'seller', name: 'Seller User', role: 'Seller' },
      { username: 'auditor', name: 'Auditor User', role: 'Auditor' },
      { username: 'viewer', name: 'Viewer User', role: 'Viewer' },
    ];

    const createdUsers = [];

    for (const testUser of testUsers) {
      // Find role
      const role = roles.find(r => r.role === testUser.role);
      if (!role) {
        console.log(`⚠️  Rol "${testUser.role}" no encontrado, saltando...`);
        continue;
      }

      // Delete existing user if exists
      try {
        await prisma.r_user.deleteMany({
          where: { user_1: testUser.username }
        });
      } catch (e) {
        // Ignore if not found
      }

      // Create new user
      const newUser = await prisma.r_user.create({
        data: {
          user_1: testUser.username,
          name: testUser.name,
          uin: `TEST-${testUser.username.toUpperCase()}-${Date.now()}`,
          id_role: role.id_role,
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

      createdUsers.push({
        username: testUser.username,
        name: testUser.name,
        role: testUser.role,
        password: testPassword
      });

      console.log(`✅ Usuario creado: ${testUser.username}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('📋 USUARIOS DE PRUEBA CREADOS:');
    console.log('='.repeat(80));
    console.log('');

    createdUsers.forEach((user, i) => {
      console.log(`${i + 1}. ${user.name}`);
      console.log(`   Username: ${user.username}`);
      console.log(`   Password: ${user.password}`);
      console.log(`   Rol: ${user.role}`);
      console.log('');
    });

    console.log('='.repeat(80));
    console.log('🧪 OPCIONES DE LOGIN:');
    console.log('='.repeat(80));
    createdUsers.forEach(user => {
      console.log(`\n    curl -X POST http://localhost:3001/auth/login \\`);
      console.log(`      -H "Content-Type: application/json" \\`);
      console.log(`      -d '{"user":"${user.username}","password":"${user.password}"}'`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Todos los usuarios de prueba han sido configurados correctamente.');
    console.log('\n💡 Tip: Usa estos usuarios para probar diferentes perfiles y permisos.\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

setupTestUsers();