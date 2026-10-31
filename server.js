const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion;

if (!process.env.VERCEL) {
  try {
    const baileys = require('@whiskeysockets/baileys');
    makeWASocket = baileys.default || baileys.makeWASocket;
    useMultiFileAuthState = baileys.useMultiFileAuthState;
    DisconnectReason = baileys.DisconnectReason;
    fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
  } catch (err) {
    console.warn('⚠️ Could not load Baileys library:', err.message);
  }
}

require('dotenv').config({ override: true });

const {
  initDb,
  findUserByEmail,
  findUserById,
  createUser,
  getAllUsers,
  updateUserStatus,
  updateUserLinkedPhone
} = require('./db');

const app = express();
const os = require('os');
const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET || 'secret123';
const JWT_SECRET = process.env.JWT_SECRET || 'jwt_flow_secret_key_99182371';
const AUTH_DIR = process.env.VERCEL 
  ? path.join(os.tmpdir(), 'session_auth') 
  : path.join(__dirname, 'session_auth');

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// OpenRouter AI Engine Configuration (nvidia/nemotron-3.5-super-vl:free)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3.5-super-vl:free';
const OPENROUTER_ENDPOINT = process.env.OPENROUTER_ENDPOINT || 'https://openrouter.ai/api/v1/chat/completions';
const RENDER_GATEWAY_DEFAULT = process.env.GATEWAY_URL || 'https://automation-whatsapp-00cl.onrender.com';


async function generateAIResponse(userMessage, contactPhone = '') {
  try {
    const systemPrompt = 'You are an automated, courteous, and highly knowledgeable assistant for our WhatsApp enterprise service. Respond clearly and professionally in 1-3 concise sentences. Guide customer inquiries warmly and offer next steps.';

    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + OPENROUTER_API_KEY,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://zabbro-automate.vercel.app',
        'X-Title': 'WhatsApp Gateway AI'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 600,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      addLog('error', 'OpenRouter error (' + response.status + '): ' + errText);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    addLog('error', 'OpenRouter AI call failed: ' + err.message);
    return null;
  }
}


// Global State
let sock = null;
let currentQR = null;
let connectionStatus = 'INITIALIZING'; // 'INITIALIZING', 'QR_READY', 'CONNECTED', 'DISCONNECTED'
let connectedUser = null;
const logs = [];

function addLog(type, message) {
  const logEntry = {
    time: new Date().toLocaleTimeString(),
    type, // 'info', 'success', 'error'
    message
  };
  logs.unshift(logEntry);
  if (logs.length > 50) logs.pop();
  console.log(`[${logEntry.time}] [${type.toUpperCase()}] ${message}`);
}

async function connectToWhatsApp() {
  if (process.env.VERCEL) {
    connectionStatus = 'SERVERLESS_ACTIVE';
    addLog('info', 'Running in Vercel Serverless environment. WhatsApp socket gateway requires persistent server (e.g. Render/VPS).');
    return;
  }

  if (!makeWASocket || !useMultiFileAuthState) {
    connectionStatus = 'DISCONNECTED';
    addLog('warn', 'Baileys not loaded. WhatsApp socket gateway unavailable.');
    return;
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    addLog('info', `Starting Baileys v${version.join('.')}, isLatest: ${isLatest}`);

    sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      auth: state,
      printQRInTerminal: true,
      defaultQueryTimeoutMs: undefined,
      syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          currentQR = await qrcode.toDataURL(qr, {
            margin: 2,
            scale: 6,
            color: { dark: '#0b0f19', light: '#ffffff' }
          });
          connectionStatus = 'QR_READY';
          addLog('info', 'New high-resolution QR Code generated. Ready for scanning.');
        } catch (err) {
          addLog('error', `Failed to generate QR Data URL: ${err.message}`);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        connectionStatus = 'DISCONNECTED';
        currentQR = null;
        connectedUser = null;

        addLog('error', `Connection closed (Status code: ${statusCode}). Reconnecting: ${shouldReconnect}`);

        if (statusCode === DisconnectReason.timedOut || statusCode === 408) {
          addLog('info', 'QR scan window timed out. Resetting unlinked session to generate fresh pair code...');
          clearSession();
          setTimeout(connectToWhatsApp, 1500);
        } else if (shouldReconnect) {
          setTimeout(connectToWhatsApp, 3000);
        } else {
          addLog('error', 'Device logged out. Clearing session and waiting for new scan.');
          clearSession();
          setTimeout(connectToWhatsApp, 2000);
        }
      } else if (connection === 'open') {
        connectionStatus = 'CONNECTED';
        currentQR = null;
        const userJid = sock.user.id || '';
        const phone = userJid.split(':')[0] || userJid.split('@')[0];
        connectedUser = {
          name: sock.user.name || 'WhatsApp User',
          phone: phone
        };
        addLog('success', `WhatsApp connected successfully for +${phone}!`);

    // Inbound Messages & AI Auto-Reply Engine via OpenRouter
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      try {
        if (type !== 'notify') return;
        for (const msg of messages) {
          if (!msg.message || msg.key.fromMe) continue;
          
          const remoteJid = msg.key.remoteJid || '';
          if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') continue;

          const text = msg.message.conversation || 
                       msg.message.extendedTextMessage?.text || 
                       msg.message.imageMessage?.caption || '';
          if (!text || text.trim().length === 0) continue;

          const cleanText = text.trim();
          const senderPhone = remoteJid.split('@')[0];

          addLog('info', '?? Incoming from +' + senderPhone + ': "' + cleanText + '"');

          // Keyword Triggers for AI Auto Reply
          const triggers = ['price', 'pricing', 'cost', 'demo', 'catalog', 'catalogue', 'brochure', 'details', 'buy', 'order', 'software', 'service', 'enquiry', 'hi', 'hello'];
          const lower = cleanText.toLowerCase();
          const isTrigger = triggers.some(t => lower.includes(t));

          if (isTrigger) {
            addLog('info', '? AI Trigger matched. Formulating reply via OpenRouter (' + OPENROUTER_MODEL + ')...');
            const aiReply = await generateAIResponse(cleanText, senderPhone);
            if (aiReply) {
              await sock.sendMessage(remoteJid, { text: aiReply });
              addLog('success', '?? AI Auto-Replied to +' + senderPhone + ': "' + aiReply.substring(0, 70) + '..."');
            }
          }
        }
      } catch (err) {
        addLog('error', 'Error processing incoming message: ' + err.message);
      }
    });

      }
    });

    // Inbound Messages & AI Auto-Reply Engine via OpenRouter
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      try {
        if (type !== 'notify') return;
        for (const msg of messages) {
          if (!msg.message || msg.key.fromMe) continue;
          
          const remoteJid = msg.key.remoteJid || '';
          if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') continue;

          const text = msg.message.conversation || 
                       msg.message.extendedTextMessage?.text || 
                       msg.message.imageMessage?.caption || '';
          if (!text || text.trim().length === 0) continue;

          const cleanText = text.trim();
          const senderPhone = remoteJid.split('@')[0];

          addLog('info', `📩 Incoming from +${senderPhone}: "${cleanText}"`);

          // Keyword Triggers for AI Auto Reply
          const triggers = ['price', 'pricing', 'cost', 'demo', 'catalog', 'catalogue', 'brochure', 'details', 'buy', 'order', 'software', 'service', 'enquiry', 'hi', 'hello'];
          const lower = cleanText.toLowerCase();
          const isTrigger = triggers.some(t => lower.includes(t));

          if (isTrigger) {
            addLog('info', `⚡ AI Trigger matched. Formulating reply via OpenRouter (${OPENROUTER_MODEL})...`);
            const aiReply = await generateAIResponse(cleanText, senderPhone);
            if (aiReply) {
              await sock.sendMessage(remoteJid, { text: aiReply });
              addLog('success', `🤖 AI Auto-Replied to +${senderPhone}: "${aiReply.substring(0, 70)}..."`);
            }
          }
        }
      } catch (err) {
        addLog('error', `Error processing incoming message: ${err.message}`);
      }
    });

  } catch (error) {
    connectionStatus = 'DISCONNECTED';
    addLog('error', `Connection error: ${error.message}`);
    setTimeout(connectToWhatsApp, 5000);
  }
}

function clearSession() {
  try {
    if (sock) {
      try {
        sock.ev.removeAllListeners();
        sock.end(undefined);
      } catch (e) {}
      sock = null;
    }
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      addLog('info', 'Session folder cleared.');
    }
  } catch (e) {
    addLog('error', `Error clearing session: ${e.message}`);
  }
}

// ---------------- AUTH MIDDLEWARES ---------------- //

function authenticateToken(req, res, next) {
  const token = req.cookies?.flow_auth_token || req.headers['authorization']?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, error: 'Invalid or expired session' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ success: false, error: 'Admin privileges required' });
  }
  next();
}

function verifyApiKey(req, res, next) {
  const token = req.headers['x-api-key'] || req.query.apiKey || req.body.apiKey;
  if (API_SECRET && token !== API_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or missing API key' });
  }
  next();
}

// ---------------- AUTHENTICATION ROUTES ---------------- //

// 1. Sign Up
app.post(['/api/auth/register', '/auth/register'], async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'All fields are required.' });
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'An account with this email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // First user or specific admin email becomes ADMIN
    const isFirstAdmin = email.toLowerCase().includes('admin');
    const role = isFirstAdmin ? 'ADMIN' : 'USER';

    const user = await createUser({
      name,
      email,
      password: hashedPassword,
      role
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('flow_auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    });

    addLog('success', `New user registered: ${user.name} (${user.email}) [Role: ${user.role}]`);

    res.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Test OpenRouter AI Auto-Reply Simulation
app.post(['/api/ai/test', '/ai/test'], async (req, res) => {
  try {
    const { message, phone } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: 'Field "message" is required' });
    }
    const reply = await generateAIResponse(message, phone);
    res.json({
      success: true,
      model: OPENROUTER_MODEL,
      incomingMessage: message,
      aiReply: reply
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Sign In
app.post(['/api/auth/login', '/auth/login'], async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({ success: false, error: 'Your account is suspended. Contact administrator.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('flow_auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    });

    addLog('info', `User logged in: ${user.name} [Role: ${user.role}]`);

    res.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Test OpenRouter AI Auto-Reply Simulation
app.post(['/api/ai/test', '/ai/test'], async (req, res) => {
  try {
    const { message, phone } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: 'Field "message" is required' });
    }
    const reply = await generateAIResponse(message, phone);
    res.json({
      success: true,
      model: OPENROUTER_MODEL,
      incomingMessage: message,
      aiReply: reply
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Current User Profile Session
app.get(['/api/auth/me', '/auth/me'], authenticateToken, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Test OpenRouter AI Auto-Reply Simulation
app.post(['/api/ai/test', '/ai/test'], async (req, res) => {
  try {
    const { message, phone } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: 'Field "message" is required' });
    }
    const reply = await generateAIResponse(message, phone);
    res.json({
      success: true,
      model: OPENROUTER_MODEL,
      incomingMessage: message,
      aiReply: reply
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Logout
app.post(['/api/auth/logout', '/auth/logout'], (req, res) => {
  res.clearCookie('flow_auth_token');
  res.json({ success: true, message: 'Logged out successfully' });
});

// ---------------- ADMIN MONITORING API ---------------- //

// Get all users and system metrics (Admin only)
app.get(['/api/admin/users', '/admin/users'], authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json({
      success: true,
      totalUsers: users.length,
      activeUsers: users.filter(u => u.status === 'ACTIVE').length,
      gatewayStatus: connectionStatus,
      connectedNumber: connectedUser?.phone || null,
      users
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Test OpenRouter AI Auto-Reply Simulation
app.post(['/api/ai/test', '/ai/test'], async (req, res) => {
  try {
    const { message, phone } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: 'Field "message" is required' });
    }
    const reply = await generateAIResponse(message, phone);
    res.json({
      success: true,
      model: OPENROUTER_MODEL,
      incomingMessage: message,
      aiReply: reply
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Toggle user status (Activate / Suspend)
app.post(['/api/admin/user-status', '/admin/user-status'], authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId, status } = req.body;
    if (!userId || !status) {
      return res.status(400).json({ success: false, error: 'Missing userId or status' });
    }
    await updateUserStatus(userId, status);
    addLog('info', `Admin updated user #${userId} status to ${status}`);
    res.json({ success: true, message: `User status changed to ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Test OpenRouter AI Auto-Reply Simulation
app.post(['/api/ai/test', '/ai/test'], async (req, res) => {
  try {
    const { message, phone } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: 'Field "message" is required' });
    }
    const reply = await generateAIResponse(message, phone);
    res.json({
      success: true,
      model: OPENROUTER_MODEL,
      incomingMessage: message,
      aiReply: reply
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------- REST API ENDPOINTS ---------------- //

// 0. API Base Info
app.get('/api', (req, res) => {
  res.json({
    status: 'OK',
    gateway: 'Flow WhatsApp Gateway & Supabase Auth API',
    serverless: !!process.env.VERCEL,
    timestamp: new Date().toISOString()
  });
});

// 1. Health check & keep-alive
app.get(['/health', '/api/health'], (req, res) => {
  res.json({
    status: 'OK',
    serverless: !!process.env.VERCEL,
    connection: process.env.VERCEL ? 'SERVERLESS_ACTIVE' : connectionStatus,
    timestamp: new Date().toISOString()
  });
});

// 2. Status & QR endpoint for Web UI
app.get(['/api/status', '/status'], (req, res) => {
  res.json({
    status: process.env.VERCEL ? 'SERVERLESS_ACTIVE' : connectionStatus,
    qr: currentQR,
    user: connectedUser,
    logs: logs.slice(0, 20),
    serverless: !!process.env.VERCEL
  });
});

// 3. Send Message endpoint (Called by Google Apps Script)
app.post(['/api/send', '/send'], verifyApiKey, async (req, res) => {
  try {
    if (process.env.VERCEL) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp socket gateway cannot run on Vercel serverless. Deploy persistent daemon to Render or VPS.'
      });
    }

    if (connectionStatus !== 'CONNECTED' || !sock) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp is not connected. Please scan the QR code first.'
      });
    }

    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: "phone" and "message"'
      });
    }

    const cleanNumber = String(phone).replace(/\D/g, '');
    if (cleanNumber.length < 7 || cleanNumber.length > 15) {
      return res.status(400).json({
        success: false,
        error: `Invalid phone number format: "${phone}". Include country code (e.g. 919876543210).`
      });
    }

    const jid = `${cleanNumber}@s.whatsapp.net`;

    const result = await sock.sendMessage(jid, { text: String(message) });
    const messageId = result?.key?.id || 'SENT';

    addLog('success', `Message sent to +${cleanNumber} (ID: ${messageId})`);

    res.json({
      success: true,
      messageId: messageId,
      phone: cleanNumber,
      sentAt: new Date().toISOString()
    });
  } catch (error) {
    addLog('error', `Failed to send to ${req.body?.phone}: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 4. Logout / Disconnect device
app.post('/api/logout', verifyApiKey, async (req, res) => {
  try {
    addLog('info', 'Manual logout requested.');
    if (sock) {
      await sock.logout();
    }
    clearSession();
    connectionStatus = 'DISCONNECTED';
    currentQR = null;
    connectedUser = null;
    setTimeout(connectToWhatsApp, 2000);
    res.json({ success: true, message: 'Logged out. Ready for new connection.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Test OpenRouter AI Auto-Reply Simulation
app.post(['/api/ai/test', '/ai/test'], async (req, res) => {
  try {
    const { message, phone } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: 'Field "message" is required' });
    }
    const reply = await generateAIResponse(message, phone);
    res.json({
      success: true,
      model: OPENROUTER_MODEL,
      incomingMessage: message,
      aiReply: reply
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Manual QR Refresh endpoint
app.post(['/api/refresh-qr', '/refresh-qr'], async (req, res) => {
  try {
    if (process.env.VERCEL) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp gateway socket requires persistent hosting (Render / VPS).'
      });
    }

    if (connectionStatus === 'CONNECTED') {
      return res.json({ success: false, error: 'Device is already connected!' });
    }
    addLog('info', 'Manual QR Refresh requested by user.');
    connectionStatus = 'INITIALIZING';
    currentQR = null;
    if (sock) {
      try { sock.end(undefined); } catch (e) {}
    }
    setTimeout(connectToWhatsApp, 1000);
    res.json({ success: true, message: 'Generating fresh QR code...' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// 6. Test OpenRouter AI Auto-Reply Simulation
app.post(['/api/ai/test', '/ai/test'], async (req, res) => {
  try {
    const { message, phone } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: 'Field "message" is required' });
    }
    const reply = await generateAIResponse(message, phone);
    res.json({
      success: true,
      model: OPENROUTER_MODEL,
      incomingMessage: message,
      aiReply: reply
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Test OpenRouter AI Auto-Reply Simulation
app.post(['/api/ai/test', '/ai/test'], async (req, res) => {
  try {
    const { message, phone } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: 'Field "message" is required' });
    }
    const reply = await generateAIResponse(message, phone);
    res.json({
      success: true,
      model: OPENROUTER_MODEL,
      incomingMessage: message,
      aiReply: reply
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start Server, DB & WhatsApp Socket when executed directly
if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`====================================================`);
    console.log(`🚀 WhatsApp Gateway Server running on port ${PORT}`);
    console.log(`🔑 API Secret: ${API_SECRET}`);
    console.log(`🌐 Dashboard: http://localhost:${PORT}`);
    console.log(`🔐 Login: http://localhost:${PORT}/login.html`);
    console.log(`🛡️ Admin: http://localhost:${PORT}/admin.html`);
    console.log(`====================================================`);
    
    // Initialize Neon database tables
    await initDb();
    
    // Start Baileys socket
    connectToWhatsApp();
  });
} else {
  // Cold start in serverless environment (Vercel)
  initDb().catch(e => console.error('DB Init err:', e.message));
}

module.exports = app;
