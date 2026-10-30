const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;

let sql = null;
if (DATABASE_URL) {
  try {
    sql = neon(DATABASE_URL);
    console.log('✅ Neon PostgreSQL Client initialized.');
  } catch (err) {
    console.error('❌ Failed to initialize Neon PostgreSQL:', err.message);
  }
} else {
  console.warn('⚠️ DATABASE_URL is not set in .env. Neon Database features will use in-memory fallback until configured.');
}

// In-Memory Fallback Store if Neon DATABASE_URL is not yet provided
const memoryStore = {
  users: [
    {
      id: 1,
      name: 'System Admin',
      email: 'admin@flow.local',
      // bcrypt hash for 'admin123'
      password: '$2a$10$wIu0mQn7hH3c5U0sK7v9sOdV5i0I0bY3S2N6aR9bU1qW2eR3tY4uI',
      role: 'ADMIN',
      status: 'ACTIVE',
      linked_phone: null,
      created_at: new Date().toISOString()
    }
  ],
  logs: []
};

/**
 * Auto-initialize database tables in Neon
 */
async function initDb() {
  if (!sql) return;
  try {
    // 1. Users Table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'USER', -- 'USER', 'ADMIN'
        status VARCHAR(50) DEFAULT 'ACTIVE', -- 'ACTIVE', 'SUSPENDED'
        linked_phone VARCHAR(50),
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // 2. Activity / Broadcast Logs Table
    await sql`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    console.log('✅ Neon PostgreSQL schema verified & tables ready.');
  } catch (err) {
    console.error('❌ Error creating Neon tables:', err.message);
  }
}

/**
 * User Operations
 */
async function findUserByEmail(email) {
  const normalizedEmail = email.toLowerCase().trim();
  if (sql) {
    try {
      const rows = await sql`SELECT * FROM users WHERE LOWER(email) = ${normalizedEmail} LIMIT 1`;
      return rows[0] || null;
    } catch (e) {
      console.error('Neon findUserByEmail error:', e.message);
    }
  }
  return memoryStore.users.find(u => u.email.toLowerCase() === normalizedEmail) || null;
}

async function findUserById(id) {
  if (sql) {
    try {
      const rows = await sql`SELECT id, name, email, role, status, linked_phone, last_login, created_at FROM users WHERE id = ${id} LIMIT 1`;
      return rows[0] || null;
    } catch (e) {
      console.error('Neon findUserById error:', e.message);
    }
  }
  const u = memoryStore.users.find(u => u.id === parseInt(id, 10));
  if (!u) return null;
  const { password, ...safeUser } = u;
  return safeUser;
}

async function createUser({ name, email, password, role = 'USER' }) {
  const normalizedEmail = email.toLowerCase().trim();
  if (sql) {
    const rows = await sql`
      INSERT INTO users (name, email, password, role)
      VALUES (${name}, ${normalizedEmail}, ${password}, ${role})
      RETURNING id, name, email, role, status, created_at;
    `;
    return rows[0];
  }
  const newUser = {
    id: memoryStore.users.length + 1,
    name,
    email: normalizedEmail,
    password,
    role,
    status: 'ACTIVE',
    linked_phone: null,
    created_at: new Date().toISOString()
  };
  memoryStore.users.push(newUser);
  const { password: _, ...safeUser } = newUser;
  return safeUser;
}

async function getAllUsers() {
  if (sql) {
    try {
      return await sql`
        SELECT id, name, email, role, status, linked_phone, last_login, created_at 
        FROM users 
        ORDER BY created_at DESC;
      `;
    } catch (e) {
      console.error('Neon getAllUsers error:', e.message);
    }
  }
  return memoryStore.users.map(({ password, ...u }) => u);
}

async function updateUserStatus(userId, status) {
  if (sql) {
    try {
      await sql`UPDATE users SET status = ${status} WHERE id = ${userId}`;
      return true;
    } catch (e) {
      console.error('Neon updateUserStatus error:', e.message);
    }
  }
  const u = memoryStore.users.find(u => u.id === parseInt(userId, 10));
  if (u) u.status = status;
  return true;
}

async function updateUserLinkedPhone(userId, phone) {
  if (sql) {
    try {
      await sql`UPDATE users SET linked_phone = ${phone} WHERE id = ${userId}`;
      return true;
    } catch (e) {
      console.error('Neon updateUserLinkedPhone error:', e.message);
    }
  }
  const u = memoryStore.users.find(u => u.id === parseInt(userId, 10));
  if (u) u.linked_phone = phone;
  return true;
}

module.exports = {
  initDb,
  findUserByEmail,
  findUserById,
  createUser,
  getAllUsers,
  updateUserStatus,
  updateUserLinkedPhone
};
