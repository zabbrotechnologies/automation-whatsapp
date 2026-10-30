const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase = null;

if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    console.log('✅ Supabase Client initialized successfully.');
  } catch (err) {
    console.error('❌ Failed to initialize Supabase client:', err.message);
  }
} else {
  console.warn('⚠️ SUPABASE_URL or SUPABASE_SERVICE_KEY not provided in .env. Using in-memory fallback until credentials are set.');
}

// In-Memory Fallback Store if Supabase credentials are not provided
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
 * Verify Supabase connectivity & auto-initialize tables
 */
async function initDb() {
  if (!supabase) return;
  try {
    // Check if table exists by reading 1 row
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error && error.code === '42P01') {
      console.warn('⚠️ "users" table does not exist in Supabase yet. Run the SQL schema provided in SUPABASE_SCHEMA.sql.');
    } else if (error) {
      console.warn('Supabase check note:', error.message);
    } else {
      console.log('✅ Supabase "users" table verified and ready.');
    }
  } catch (err) {
    console.error('Error verifying Supabase database:', err.message);
  }
}

/**
 * User Operations
 */
async function findUserByEmail(email) {
  const normalizedEmail = email.toLowerCase().trim();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', normalizedEmail)
        .maybeSingle();
      
      if (!error && data) return data;
    } catch (e) {
      console.error('Supabase findUserByEmail error:', e.message);
    }
  }
  return memoryStore.users.find(u => u.email.toLowerCase() === normalizedEmail) || null;
}

async function findUserById(id) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, status, linked_phone, last_login, created_at')
        .eq('id', id)
        .maybeSingle();
      
      if (!error && data) return data;
    } catch (e) {
      console.error('Supabase findUserById error:', e.message);
    }
  }
  const u = memoryStore.users.find(u => u.id === parseInt(id, 10));
  if (!u) return null;
  const { password, ...safeUser } = u;
  return safeUser;
}

async function createUser({ name, email, password, role = 'USER' }) {
  const normalizedEmail = email.toLowerCase().trim();
  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          name,
          email: normalizedEmail,
          password,
          role,
          status: 'ACTIVE'
        }
      ])
      .select('id, name, email, role, status, created_at')
      .single();

    if (error) {
      throw new Error(error.message);
    }
    return data;
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
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, status, linked_phone, last_login, created_at')
        .order('created_at', { ascending: false });

      if (!error && data) return data;
    } catch (e) {
      console.error('Supabase getAllUsers error:', e.message);
    }
  }
  return memoryStore.users.map(({ password, ...u }) => u);
}

async function updateUserStatus(userId, status) {
  if (supabase) {
    try {
      const { error } = await supabase
        .from('users')
        .update({ status })
        .eq('id', userId);

      if (!error) return true;
    } catch (e) {
      console.error('Supabase updateUserStatus error:', e.message);
    }
  }
  const u = memoryStore.users.find(u => u.id === parseInt(userId, 10));
  if (u) u.status = status;
  return true;
}

async function updateUserLinkedPhone(userId, phone) {
  if (supabase) {
    try {
      const { error } = await supabase
        .from('users')
        .update({ linked_phone: phone })
        .eq('id', userId);

      if (!error) return true;
    } catch (e) {
      console.error('Supabase updateUserLinkedPhone error:', e.message);
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
