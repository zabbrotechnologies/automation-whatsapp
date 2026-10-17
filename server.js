const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET || 'secret123';
const AUTH_DIR = path.join(__dirname, 'session_auth');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
          currentQR = await qrcode.toDataURL(qr);
          connectionStatus = 'QR_READY';
          addLog('info', 'New QR Code generated. Ready for scanning.');
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

        if (shouldReconnect) {
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
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      addLog('info', 'Session folder cleared.');
    }
  } catch (e) {
    addLog('error', `Error clearing session: ${e.message}`);
  }
}

// Middleware: API Secret verification
function verifyApiKey(req, res, next) {
  const token = req.headers['x-api-key'] || req.query.apiKey || req.body.apiKey;
  if (API_SECRET && token !== API_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or missing API key' });
  }
  next();
}

// ---------------- REST API ENDPOINTS ---------------- //

// 1. Health check & keep-alive
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    connection: connectionStatus,
    timestamp: new Date().toISOString()
  });
});

// 2. Status & QR endpoint for Web UI
app.get('/api/status', (req, res) => {
  res.json({
    status: connectionStatus,
    qr: currentQR,
    user: connectedUser,
    logs: logs.slice(0, 20)
  });
});

// 3. Send Message endpoint (Called by Google Apps Script)
app.post('/api/send', verifyApiKey, async (req, res) => {
  try {
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

    // Clean phone number (strip '+', spaces, dashes)
    const cleanNumber = String(phone).replace(/\D/g, '');
    if (cleanNumber.length < 7 || cleanNumber.length > 15) {
      return res.status(400).json({
        success: false,
        error: `Invalid phone number format: "${phone}". Include country code (e.g. 919876543210).`
      });
    }

    const jid = `${cleanNumber}@s.whatsapp.net`;

    // Send WhatsApp text message
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

// Start Server & WhatsApp Socket
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 WhatsApp Gateway Server running on port ${PORT}`);
  console.log(`🔑 API Secret: ${API_SECRET}`);
  console.log(`🌐 Dashboard: http://localhost:${PORT}`);
  console.log(`====================================================`);
  connectToWhatsApp();
});
