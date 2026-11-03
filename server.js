const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Load Baileys conditionally
let makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion;
try {
  const baileys = require('@whiskeysockets/baileys');
  makeWASocket = baileys.default || baileys.makeWASocket;
  DisconnectReason = baileys.DisconnectReason;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
} catch (e) {
  console.warn('Baileys module not loaded:', e.message);
}

// Database Operations
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

// ---------------- BUSINESS SETTINGS & TARGETING REPOSITORY ---------------- //
const SETTINGS_FILE = path.join(__dirname, 'business_settings.json');

const DEFAULT_SETTINGS = {
  business_profile: "Flow provides automated WhatsApp communication engineered for enterprise precision. Broadcast personalized campaigns directly from public Google Sheets, automate intelligent AI product responses with custom keyword triggers, and manage companion sessions with zero ban risk.",
  website_url: "https://zabbro-automate.vercel.app",
  auto_reply_enabled: true,
  welcome_msg_enabled: true,
  keyword_pairs: [
    {
      keyword: "price",
      answer: "Our packages start at ₹999/month for unlimited campaigns with live socket synchronization. Visit our website for full details!"
    },
    {
      keyword: "demo",
      answer: "You can try our live interactive dashboard directly at our web portal with one-click setup."
    },
    {
      keyword: "support",
      answer: "Our priority technical support team is available 24/7. Reply to this chat with any questions!"
    }
  ]
};

function isBusinessKnowledgeConfigured(settings) {
  if (!settings) return false;
  const hasProfile = typeof settings.business_profile === 'string' && settings.business_profile.trim().length >= 15;
  const hasPairs = Array.isArray(settings.keyword_pairs) && settings.keyword_pairs.some(
    p => p && typeof p.keyword === 'string' && p.keyword.trim().length > 0 && typeof p.answer === 'string' && p.answer.trim().length > 0
  );
  return Boolean(hasProfile || hasPairs);
}

function getBusinessSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.error('Error reading business settings:', err.message);
  }
  return DEFAULT_SETTINGS;
}

function saveBusinessSettings(newSettings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(newSettings, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error saving business settings:', err.message);
    return false;
  }
}

async function generateAIResponse(userMessage, contactPhone = '', customSettings = null) {
  try {
    const settings = customSettings || getBusinessSettings();
    if (!isBusinessKnowledgeConfigured(settings)) {
      return null;
    }

    // Format all configured keyword pairs into structured knowledge context
    let pairsContext = '';
    if (Array.isArray(settings.keyword_pairs) && settings.keyword_pairs.length > 0) {
      pairsContext = settings.keyword_pairs
        .filter(p => p && p.keyword && p.answer)
        .map(p => `- Topic/Keyword: "${p.keyword}" -> Details: "${p.answer}"`)
        .join('\n');
    }

    const systemPrompt = `You are a strictly grounded customer assistant for our business.
You must answer questions strictly and solely using the business knowledge provided below.

=== BUSINESS KNOWLEDGE BASE ===
Business Profile:
${settings.business_profile || 'Not provided.'}

Official Website:
${settings.website_url || 'Not provided.'}

Configured Topics & Knowledge Pairs:
${pairsContext || 'None provided.'}
===============================

CRITICAL RULES:
1. Answer ONLY using the facts explicitly stated in the Business Knowledge Base above.
2. If the user's message is a simple polite greeting (e.g. "hi", "hello", "hey", "good morning"), reply warmly welcoming them to our business in 1 concise sentence.
3. If the user asks about ANYTHING outside the Business Knowledge Base above (e.g. unrelated questions, general knowledge, weather, coding, personal questions, other companies, jokes, or off-topic queries), you MUST output EXACTLY: [NO_REPLY]
4. NEVER use external general knowledge, do NOT invent facts, and NEVER answer questions outside this business data.
5. If the question can be answered from the data above, respond clearly, politely, and concisely in 1-2 sentences.`;

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
        max_tokens: 160,
        temperature: 0.3,
        reasoning: {
          max_tokens: 0
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      addLog('error', 'OpenRouter error (' + response.status + '): ' + errText);
      return null;
    }

    const data = await response.json();
    const rawReply = data.choices?.[0]?.message?.content?.trim() || null;
    if (!rawReply || rawReply.includes('[NO_REPLY]')) {
      return null;
    }
    return rawReply;
  } catch (err) {
    addLog('error', 'OpenRouter AI call failed: ' + err.message);
    return null;
  }
}

// Global State
let sock = null;
let currentQR = null;
let isManualRefreshRequested = false;
let connectionStatus = 'INITIALIZING'; // 'INITIALIZING', 'QR_READY', 'CONNECTED', 'RECONNECTING', 'DISCONNECTED'
let connectedUser = null;
const logs = [];

// Message Deduplication cache to prevent duplicate bot replies
const processedMsgIds = new Set();

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
    
    // Check if user is already registered in saved creds
    if (state.creds?.me?.id) {
      const savedPhone = state.creds.me.id.split(':')[0].split('@')[0];
      connectedUser = {
        name: state.creds.me.name || 'WhatsApp User',
        phone: savedPhone
      };
      connectionStatus = 'CONNECTED';
      addLog('info', `Found existing saved authentication session for +${savedPhone}. Restoring...`);
    }

    addLog('info', `Starting Baileys v${version.join('.')}, isLatest: ${isLatest}`);

    // Clean existing socket listeners before creating a new socket
    if (sock) {
      try {
        sock.ev.removeAllListeners();
      } catch (e) {}
    }

    sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      auth: state,
      printQRInTerminal: true,
      defaultQueryTimeoutMs: undefined,
      syncFullHistory: false,
      qrTimeout: 180000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          if (!currentQR || isManualRefreshRequested) {
            currentQR = await qrcode.toDataURL(qr, {
              margin: 2,
              scale: 6,
              color: { dark: '#0b0f19', light: '#ffffff' }
            });
            connectionStatus = 'QR_READY';
            isManualRefreshRequested = false;
            addLog('info', 'Fixed pairing QR code generated and locked. Waiting for scan.');
          }
        } catch (err) {
          addLog('error', `Failed to generate QR Data URL: ${err.message}`);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        
        // Check if device was previously authenticated
        const hasSavedAuth = Boolean(connectedUser || state.creds?.registered || state.creds?.me);

        // If not logged out explicitly from mobile WhatsApp, DO NOT clear session! Retain session and auto-reconnect!
        if (!isLoggedOut && hasSavedAuth) {
          connectionStatus = 'RECONNECTING';
          addLog('info', `Socket connection blip (Code: ${statusCode}). Preserving linked session for +${connectedUser?.phone || 'device'}. Auto-reconnecting in 3s...`);
          setTimeout(connectToWhatsApp, 3000);
          return;
        }

        // Only clear session if user EXPLICITLY logged out from mobile WhatsApp (Code 401)
        if (isLoggedOut) {
          addLog('error', 'Device explicitly logged out from mobile WhatsApp. Session cleared.');
          clearSession();
          connectionStatus = 'DISCONNECTED';
          currentQR = null;
          connectedUser = null;
          setTimeout(connectToWhatsApp, 2000);
          return;
        }

        // Unlinked socket closed (e.g. initial timeout before scan)
        connectionStatus = 'DISCONNECTED';
        addLog('info', `Pairing socket reset (Code: ${statusCode}). Refreshing pairing state...`);
        setTimeout(connectToWhatsApp, 3000);

      } else if (connection === 'open') {
        connectionStatus = 'CONNECTED';
        currentQR = null;
        const userJid = sock.user?.id || state.creds?.me?.id || '';
        const phone = userJid.split(':')[0] || userJid.split('@')[0];
        connectedUser = {
          name: sock.user?.name || state.creds?.me?.name || 'WhatsApp User',
          phone: phone
        };
        addLog('success', `WhatsApp connected successfully for +${phone}!`);
      }
    });

    // Inbound Messages Engine (SINGLE HANDLER - TARGETING KEYWORD PAIRS & AI FALLBACK)
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      try {
        if (type !== 'notify') return;
        for (const msg of messages) {
          if (!msg.message || msg.key.fromMe) continue;
          
          const remoteJid = msg.key.remoteJid || '';
          if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') continue;

          // Strict Message ID Deduplication (Prevents duplicate replies)
          const msgId = msg.key?.id;
          if (!msgId || processedMsgIds.has(msgId)) continue;
          processedMsgIds.add(msgId);
          if (processedMsgIds.size > 2000) {
            const [first] = processedMsgIds;
            processedMsgIds.delete(first);
          }

          const text = msg.message.conversation || 
                       msg.message.extendedTextMessage?.text || 
                       msg.message.imageMessage?.caption || '';
          if (!text || text.trim().length === 0) continue;

          const cleanText = text.trim();
          const senderPhone = remoteJid.split('@')[0];

          addLog('info', `📩 Incoming from +${senderPhone}: "${cleanText}"`);

          const settings = getBusinessSettings();

          // Prerequisite gating: Customers must configure their business details before automated replies occur
          if (!isBusinessKnowledgeConfigured(settings)) {
            addLog('info', `Automated reply paused for +${senderPhone}: Business details and targeting keywords have not been configured yet.`);
            continue;
          }

          // Step 1: Direct Targeting Words & Answers (Key-Value Matching)
          let matchedPair = null;
          if (Array.isArray(settings.keyword_pairs)) {
            const lower = cleanText.toLowerCase();
            matchedPair = settings.keyword_pairs.find(p => {
              const kw = (p.keyword || '').trim().toLowerCase();
              return kw && lower.includes(kw);
            });
          }

          if (matchedPair && matchedPair.answer && matchedPair.answer.trim()) {
            addLog('info', `🎯 Targeting keyword "${matchedPair.keyword}" matched for +${senderPhone}. Sending configured answer...`);
            await sock.sendMessage(remoteJid, { text: matchedPair.answer.trim() });
            addLog('success', `🤖 Direct Replied to +${senderPhone}: "${matchedPair.answer.trim().substring(0, 60)}..."`);
            continue;
          }

          // Step 2: Intelligent AI Auto-Reply (Grounded strictly in Business Knowledge Base)
          if (settings.auto_reply_enabled !== false) {
            addLog('info', `⚡ Checking inquiry against Business Knowledge Base for +${senderPhone}...`);
            const aiReply = await generateAIResponse(cleanText, senderPhone, settings);
            if (aiReply) {
              await sock.sendMessage(remoteJid, { text: aiReply.trim() });
              addLog('success', `🤖 AI Replied to +${senderPhone} from Knowledge Base: "${aiReply.trim().substring(0, 70)}..."`);
            } else {
              addLog('info', `Query from +${senderPhone} ("${cleanText}") is outside Business Knowledge Base. No reply sent.`);
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

// ---------------- BUSINESS KNOWLEDGE BASE & TARGETING API ---------------- //

// GET Business Knowledge Base & Targeting Keywords
app.get(['/api/business-settings', '/business-settings'], (req, res) => {
  try {
    const settings = getBusinessSettings();
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Business Knowledge Base & Targeting Keywords
app.post(['/api/business-settings', '/business-settings'], (req, res) => {
  try {
    const { business_profile, website_url, keyword_pairs, auto_reply_enabled, welcome_msg_enabled } = req.body;
    
    const current = getBusinessSettings();
    const updated = {
      ...current,
      business_profile: typeof business_profile === 'string' ? business_profile : current.business_profile,
      website_url: typeof website_url === 'string' ? website_url : current.website_url,
      auto_reply_enabled: auto_reply_enabled !== undefined ? Boolean(auto_reply_enabled) : current.auto_reply_enabled,
      welcome_msg_enabled: welcome_msg_enabled !== undefined ? Boolean(welcome_msg_enabled) : current.welcome_msg_enabled,
      keyword_pairs: Array.isArray(keyword_pairs) 
        ? keyword_pairs.filter(p => p && typeof p.keyword === 'string' && p.keyword.trim().length > 0)
        : current.keyword_pairs
    };

    const isConfigured = isBusinessKnowledgeConfigured(updated);
    if (updated.auto_reply_enabled && !isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Setup Required: Please complete your business details or targeting keywords below before turning AI Auto Reply ON.'
      });
    }

    saveBusinessSettings(updated);
    addLog('info', 'Business Profile & Targeting Keywords saved successfully.');
    res.json({ success: true, message: 'Settings saved successfully', settings: updated });
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

// 3. Send Message endpoint (Called by Google Apps Script or Frontend)
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

    let cleanNumber = String(phone).replace(/\D/g, '');
    if (cleanNumber.length === 10) {
      cleanNumber = '91' + cleanNumber;
    }
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

// 5. Test OpenRouter AI Auto-Reply Simulation
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
      replied: Boolean(reply),
      aiReply: reply || null,
      note: reply ? 'Answered from Knowledge Base' : 'Outside Knowledge Base - No reply sent'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Manual QR Refresh endpoint
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
    isManualRefreshRequested = true;
    clearSession();
    setTimeout(connectToWhatsApp, 800);
    res.json({ success: true, message: 'Generating fresh QR code...' });
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
