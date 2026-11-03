const db = require('../db.js');
const bcrypt = require('bcryptjs');

async function testUserAuth() {
  const admin = await db.findUserByEmail('admin@flow.local');
  console.log('Admin found:', !!admin);
  console.log('Matches admin123:', await bcrypt.compare('admin123', admin.password));

  const allUsers = await db.getAllUsers();
  console.log('\nAll users in Supabase:');
  allUsers.forEach(u => console.log(`ID: ${u.id} | Name: ${u.name} | Email: ${u.email} | Status: ${u.status} | Role: ${u.role}`));
}

testUserAuth().catch(console.error);

