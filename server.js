require('dotenv').config();
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

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
  updateUser,
  deleteUser,
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
const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');
const OPTOUTS_FILE = path.join(__dirname, 'data', 'optouts.json');
const ESCALATIONS_FILE = path.join(__dirname, 'data', 'escalations.json');
const SESSION_INFO_FILE = path.join(__dirname, 'data', 'session_info.json');

// Configure Multer for Media Uploads (Images, Videos, Catalogs)
const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `media_${Date.now()}_${cleanBase}${ext}`);
  }
});

const uploadMedia = multer({
  storage: mediaStorage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB limit
  fileFilter: (req, file, cb) => {
    const allowedExts = /jpeg|jpg|png|webp|gif|mp4|mov|avi|pdf/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const mime = file.mimetype.toLowerCase();
    if (allowedExts.test(ext) || mime.startsWith('image/') || mime.startsWith('video/') || mime === 'application/pdf') {
      return cb(null, true);
    }
    cb(new Error('Only images, videos (MP4/MOV), and PDFs are supported.'));
  }
});

const DEFAULT_SETTINGS = {
  business_profile: "Flow provides automated WhatsApp communication engineered for enterprise precision. Broadcast personalized campaigns directly from public Google Sheets, automate intelligent AI product responses with custom keyword triggers, and manage companion sessions with zero ban risk.",
  website_url: "https://zabbro-automate.vercel.app",
  auto_reply_enabled: true,
  welcome_msg_enabled: true,
  welcome_message: "Welcome to Flow Enterprise Automation! 🌟 We engineer seamless WhatsApp communication for businesses.",
  welcome_media_url: "/uploads/flow_overview.jpg",
  welcome_media_type: "image",
  welcome_options: [
    {
      option_num: "1",
      title: "View Pricing & Packages",
      answer: "Our packages start at ₹999/month for unlimited campaigns with live socket synchronization. Visit our website for full details!"
    },
    {
      option_num: "2",
      title: "Request Live Interactive Demo",
      answer: "You can try our live interactive dashboard directly at our web portal with one-click setup."
    },
    {
      option_num: "3",
      title: "Product & Service Catalog",
      answer: "You can view our complete service catalog and integrations on our official website: https://zabbro-automate.vercel.app"
    },
    {
      option_num: "4",
      title: "Talk to Support Executive",
      answer: "Understood! Automated replies are now paused for this chat. Our executive has been notified and will assist you directly."
    }
  ],
  outside_kb_action: "FALLBACK_MSG",
  fallback_message: "I don't have that specific detail in our catalog right now, but I've alerted our team. An executive will follow up with you shortly!",
  escalation_notice: "Understood! Automated replies are now paused for this chat. Our executive has been notified and will assist you directly.",
  optout_message: "You have been unsubscribed from automated updates. Reply START anytime to re-enable.",
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
    },
    {
      keyword: "catalog",
      answer: "You can view our complete service catalog and integrations on our official website: https://zabbro-automate.vercel.app"
    }
  ]
};

// --- DATA ACCESS HELPERS (LEADS, OPTOUTS, ESCALATIONS) --- //
function getLeads() {
  try {
    if (fs.existsSync(LEADS_FILE)) {
      return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Error reading leads:', e.message);
  }
  return [];
}

function saveLeads(leads) {
  try {
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving leads:', e.message);
  }
}

function recordLeadInteraction({ phone, name = '', inquiry, reply = '', intent = 'General', status = 'AI_HANDLED' }) {
  try {
    const clean = String(phone).replace(/\D/g, '');
    const leads = getLeads();
    const existingIndex = leads.findIndex(l => l.phone === clean);
    const now = new Date().toISOString();
    if (existingIndex >= 0) {
      leads[existingIndex].lastSeen = now;
      leads[existingIndex].totalMessages = (leads[existingIndex].totalMessages || 1) + 1;
      leads[existingIndex].lastInquiry = inquiry;
      if (reply) leads[existingIndex].lastReply = reply;
      leads[existingIndex].matchedIntent = intent;
      if (status) leads[existingIndex].status = status;
      if (name && (!leads[existingIndex].name || leads[existingIndex].name.startsWith('Lead +'))) {
        leads[existingIndex].name = name;
      }
    } else {
      leads.unshift({
        phone: clean,
        name: name || `Lead +${clean.slice(-4)}`,
        firstSeen: now,
        lastSeen: now,
        totalMessages: 1,
        lastInquiry: inquiry,
        lastReply: reply,
        matchedIntent: intent,
        status: status
      });
    }
    const MAX_LEADS_RETAINED = parseInt(process.env.MAX_LEADS_RETAINED, 10) || 2000;
    saveLeads(leads.slice(0, MAX_LEADS_RETAINED));
  } catch (e) {
    console.error('Error recording lead:', e.message);
  }
}

function getOptOuts() {
  try {
    if (fs.existsSync(OPTOUTS_FILE)) {
      return JSON.parse(fs.readFileSync(OPTOUTS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Error reading optouts:', e.message);
  }
  return [];
}

function saveOptOuts(optouts) {
  try {
    fs.writeFileSync(OPTOUTS_FILE, JSON.stringify(optouts, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving optouts:', e.message);
  }
}

function isOptedOut(phone) {
  const clean = String(phone).replace(/\D/g, '');
  const optouts = getOptOuts();
  return optouts.some(o => o.phone === clean);
}

function addOptOut(phone, reason = 'User requested stop') {
  const clean = String(phone).replace(/\D/g, '');
  const optouts = getOptOuts();
  if (!optouts.some(o => o.phone === clean)) {
    optouts.unshift({ phone: clean, optedOutAt: new Date().toISOString(), reason });
    saveOptOuts(optouts);
  }
}

function removeOptOut(phone) {
  const clean = String(phone).replace(/\D/g, '');
  const optouts = getOptOuts().filter(o => o.phone !== clean);
  saveOptOuts(optouts);
}

function getEscalations() {
  try {
    if (fs.existsSync(ESCALATIONS_FILE)) {
      return JSON.parse(fs.readFileSync(ESCALATIONS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Error reading escalations:', e.message);
  }
  return {};
}

function saveEscalations(esc) {
  try {
    fs.writeFileSync(ESCALATIONS_FILE, JSON.stringify(esc, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving escalations:', e.message);
  }
}

function isEscalated(phone) {
  const clean = String(phone).replace(/\D/g, '');
  const esc = getEscalations();
  return Boolean(esc[clean] && esc[clean].status === 'PENDING');
}

function addEscalation(phone, name, query, reason = 'Customer requested live human executive') {
  const clean = String(phone).replace(/\D/g, '');
  const esc = getEscalations();
  esc[clean] = {
    phone: clean,
    name: name || `Contact +${clean.slice(-4)}`,
    reason,
    query,
    escalatedAt: new Date().toISOString(),
    status: 'PENDING'
  };
  saveEscalations(esc);
}

function resolveEscalation(phone) {
  const clean = String(phone).replace(/\D/g, '');
  const esc = getEscalations();
  if (esc[clean]) {
    delete esc[clean];
    saveEscalations(esc);
  }
}

const ESCALATION_TRIGGERS = [
  'agent', 'human', 'executive', 'representative', 'complaint',
  'talk to agent', 'talk to an agent', 'speak to an agent', 'speak to agent',
  'live support', 'real person', 'customer care', 'person'
];

const OPTOUT_TRIGGERS = ['stop', 'unsubscribe', 'cancel', 'quit', 'end', 'optout'];
const OPTIN_TRIGGERS = ['start', 'resubscribe', 'subscribe', 'restart'];

// --- MASTER INBOUND PROCESSING ENGINE (SHARED BY WHATSAPP SOCKET & SIMULATOR) --- //
async function processInboundText(cleanText, senderPhone = '', senderName = '') {
  const lower = cleanText.toLowerCase().trim();
  const settings = getBusinessSettings();

  // 1. Check Opt-Out Triggers (STOP / UNSUBSCRIBE)
  if (OPTOUT_TRIGGERS.includes(lower)) {
    addOptOut(senderPhone, 'User sent ' + cleanText);
    const reply = settings.optout_message || 'You have been unsubscribed from automated updates. Reply START anytime to re-enable.';
    recordLeadInteraction({
      phone: senderPhone,
      name: senderName,
      inquiry: cleanText,
      reply: reply,
      intent: 'Opt-Out',
      status: 'OPTED_OUT'
    });
    return {
      type: 'OPTOUT',
      matched: cleanText,
      reply: reply,
      explanation: 'Contact opted out. Phone added to blacklist; automated broadcasts will safely bypass this number.'
    };
  }

  // 2. Check Opt-In Triggers (START / RESUBSCRIBE)
  if (OPTIN_TRIGGERS.includes(lower)) {
    removeOptOut(senderPhone);
    const welcomeBack = 'Welcome back! You have been successfully resubscribed to updates.';
    recordLeadInteraction({
      phone: senderPhone,
      name: senderName,
      inquiry: cleanText,
      reply: welcomeBack,
      intent: 'Opt-In',
      status: 'AI_HANDLED'
    });
    return {
      type: 'OPTIN',
      matched: cleanText,
      reply: welcomeBack,
      explanation: 'Contact resubscribed. Phone removed from blacklist.'
    };
  }

  // 3. Check if contact is currently under Human Takeover
  if (isEscalated(senderPhone)) {
    recordLeadInteraction({
      phone: senderPhone,
      name: senderName,
      inquiry: cleanText,
      reply: '(Suppressed - Human Takeover Active)',
      intent: 'Escalation Follow-up',
      status: 'ESCALATED'
    });
    return {
      type: 'HUMAN_TAKEOVER_ACTIVE',
      reply: null,
      explanation: 'Chat is currently in Human Takeover mode. Bot responses are paused to let live executives chat directly.'
    };
  }

  // 4. Check Escalation Triggers (talk to agent, complaint, etc.)
  const matchedEsc = ESCALATION_TRIGGERS.find(t => lower.includes(t));
  if (matchedEsc) {
    addEscalation(senderPhone, senderName, cleanText, `Triggered by "${matchedEsc}"`);
    const escReply = settings.escalation_notice || 'Understood! Automated replies are now paused for this chat. Our executive has been notified and will assist you directly.';
    recordLeadInteraction({
      phone: senderPhone,
      name: senderName,
      inquiry: cleanText,
      reply: escReply,
      intent: 'Escalation',
      status: 'ESCALATED'
    });
    return {
      type: 'ESCALATION',
      matched: matchedEsc,
      reply: escReply,
      explanation: `Human escalation trigger "${matchedEsc}" matched. Bot paused for this chat and support team alerted.`
    };
  }

  // 4b. Check Welcome Menu Option Selection (e.g. user typed "1", "2", "3", "4", "1️⃣", "option 1")
  const cleanOptionInput = lower.replace(/[#️⃣.()\s]/g, '');
  const matchedOption = (settings.welcome_options || []).find(opt => {
    const num = String(opt.option_num || '').trim().toLowerCase();
    const title = String(opt.title || '').trim().toLowerCase();
    return (num && cleanOptionInput === num) || 
           (num && lower === `option ${num}`) ||
           (title && lower.includes(title));
  });

  if (matchedOption && matchedOption.answer && matchedOption.answer.trim()) {
    // If the selected option is a request for a human/agent/support
    if (/support|agent|executive|human|complaint/i.test(matchedOption.title || '')) {
      addEscalation(senderPhone, senderName, cleanText, `Triggered from Option #${matchedOption.option_num} (${matchedOption.title})`);
      const escReply = settings.escalation_notice || matchedOption.answer.trim();
      recordLeadInteraction({
        phone: senderPhone,
        name: senderName,
        inquiry: cleanText,
        reply: escReply,
        intent: `Option ${matchedOption.option_num}: ${matchedOption.title}`,
        status: 'ESCALATED'
      });
      return {
        type: 'ESCALATION',
        matched: `Option ${matchedOption.option_num}`,
        reply: escReply,
        explanation: `Customer selected Option #${matchedOption.option_num} (${matchedOption.title}). Human takeover initiated.`
      };
    }

    const optAns = matchedOption.answer.trim();
    recordLeadInteraction({
      phone: senderPhone,
      name: senderName,
      inquiry: cleanText,
      reply: optAns,
      intent: `Option ${matchedOption.option_num}: ${matchedOption.title}`,
      status: 'AI_HANDLED'
    });
    return {
      type: 'OPTION_SELECTION',
      matched: `Option ${matchedOption.option_num}`,
      reply: optAns,
      explanation: `Customer selected Option #${matchedOption.option_num} (${matchedOption.title}). Direct answer sent.`
    };
  }

  // 4c. Check Welcome Message & Interactive Options Trigger (Greetings / First Interaction)
  const GREETING_TRIGGERS = [
    'hi', 'hello', 'hey', 'start', 'menu', 'options', 'help', 
    'vanakkam', 'namaste', 'morning', 'evening', 'good morning', 
    'good afternoon', 'good evening', 'info', 'welcome'
  ];
  const isGreetingWord = GREETING_TRIGGERS.some(g => lower === g || lower.startsWith(g + ' ') || lower.endsWith(' ' + g) || lower === `${g}!`);
  
  // Check if this is the first message ever received from this contact
  const allLeads = getLeads();
  const isFirstInteraction = senderPhone && !allLeads.some(l => l.phone === String(senderPhone).replace(/\D/g, ''));

  if (settings.welcome_msg_enabled && (isGreetingWord || isFirstInteraction)) {
    let welcomeText = (settings.welcome_message || 'Welcome to our business! 🌟 How can we help you today?').trim();
    if (Array.isArray(settings.welcome_options) && settings.welcome_options.length > 0) {
      const optionsFormatted = settings.welcome_options
        .map(o => `${o.option_num}️⃣ ${o.title}`)
        .join('\n');
      welcomeText += `\n\n📌 *Please reply with an option number:*\n${optionsFormatted}\n\n_(Or simply type your question!)_`;
    }

    recordLeadInteraction({
      phone: senderPhone,
      name: senderName,
      inquiry: cleanText,
      reply: welcomeText,
      intent: 'Welcome Greeting & Menu',
      status: 'AI_HANDLED'
    });

    return {
      type: 'WELCOME_MENU',
      matched: isGreetingWord ? 'Greeting Word' : 'First Interaction',
      reply: welcomeText,
      media_url: settings.welcome_media_url || null,
      media_type: settings.welcome_media_type || 'image',
      options: settings.welcome_options || [],
      explanation: 'Customer greeted or initiated contact. Sent welcome greeting, media attachment, and interactive option list.'
    };
  }

  // 5. Check Prerequisite Gating (Business details must be set)
  if (!isBusinessKnowledgeConfigured(settings)) {
    return {
      type: 'SETUP_REQUIRED',
      reply: null,
      explanation: 'Automated replies are paused because the customer has not configured business details yet.'
    };
  }

  // 6. Direct Targeting Words & Answers (Key-Value Matching)
  let matchedPair = null;
  if (Array.isArray(settings.keyword_pairs)) {
    matchedPair = settings.keyword_pairs.find(p => {
      const kw = (p.keyword || '').trim().toLowerCase();
      return kw && lower.includes(kw);
    });
  }

  if (matchedPair && matchedPair.answer && matchedPair.answer.trim()) {
    const ans = matchedPair.answer.trim();
    recordLeadInteraction({
      phone: senderPhone,
      name: senderName,
      inquiry: cleanText,
      reply: ans,
      intent: matchedPair.keyword,
      status: 'AI_HANDLED'
    });
    return {
      type: 'KEYWORD_MATCH',
      matched: matchedPair.keyword,
      reply: ans,
      explanation: `Targeting keyword "${matchedPair.keyword}" matched instantly. Direct answer sent without consuming AI tokens.`
    };
  }

  // 7. Intelligent AI Auto-Reply (Grounded in Business Knowledge Base)
  if (settings.auto_reply_enabled !== false) {
    const aiReply = await generateAIResponse(cleanText, senderPhone, settings);
    if (aiReply) {
      recordLeadInteraction({
        phone: senderPhone,
        name: senderName,
        inquiry: cleanText,
        reply: aiReply.trim(),
        intent: 'Knowledge Base',
        status: 'AI_HANDLED'
      });
      return {
        type: 'AI_KNOWLEDGE_BASE',
        reply: aiReply.trim(),
        explanation: 'Inquiry addressed using verified facts strictly grounded in your Business Knowledge Base.'
      };
    } else {
      // Outside Knowledge Base
      if (settings.outside_kb_action === 'FALLBACK_MSG') {
        const fallback = settings.fallback_message || "I don't have that specific detail in our catalog right now, but I've alerted our team. An executive will follow up with you shortly!";
        recordLeadInteraction({
          phone: senderPhone,
          name: senderName,
          inquiry: cleanText,
          reply: fallback,
          intent: 'Fallback',
          status: 'AI_HANDLED'
        });
        return {
          type: 'OUTSIDE_KB_FALLBACK',
          reply: fallback,
          explanation: 'Question is outside Knowledge Base. Sent courteous fallback message without inventing facts.'
        };
      } else {
        recordLeadInteraction({
          phone: senderPhone,
          name: senderName,
          inquiry: cleanText,
          reply: '(Silent - Zero Hallucinations)',
          intent: 'Outside Knowledge',
          status: 'AI_HANDLED'
        });
        return {
          type: 'OUTSIDE_KB_SILENT',
          reply: null,
          explanation: 'Question is outside Knowledge Base. Bot remained completely silent (zero hallucinations).'
        };
      }
    }
  }

  return {
    type: 'AUTO_REPLY_DISABLED',
    reply: null,
    explanation: 'AI Auto-Reply toggle switch is currently OFF.'
  };
}

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
try {
  if (fs.existsSync(SESSION_INFO_FILE)) {
    connectedUser = JSON.parse(fs.readFileSync(SESSION_INFO_FILE, 'utf-8'));
  }
} catch (e) {}
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
        try {
          fs.writeFileSync(SESSION_INFO_FILE, JSON.stringify(connectedUser, null, 2), 'utf-8');
        } catch (e) {}
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

          const result = await processInboundText(cleanText, senderPhone, msg.pushName || '');
          if (result && result.reply) {
            // Check if media attachment is attached to this reply
            if (result.media_url) {
              try {
                let sentMedia = false;
                const relativePath = result.media_url.replace(/^\//, '');
                const localPath = path.join(__dirname, 'public', relativePath);
                
                if (fs.existsSync(localPath)) {
                  const mediaBuf = fs.readFileSync(localPath);
                  if (result.media_type === 'video') {
                    await sock.sendMessage(remoteJid, { video: mediaBuf, caption: result.reply });
                    sentMedia = true;
                  } else if (result.media_type === 'document') {
                    await sock.sendMessage(remoteJid, { 
                      document: mediaBuf, 
                      mimetype: 'application/pdf', 
                      fileName: path.basename(localPath), 
                      caption: result.reply 
                    });
                    sentMedia = true;
                  } else {
                    await sock.sendMessage(remoteJid, { image: mediaBuf, caption: result.reply });
                    sentMedia = true;
                  }
                } else if (result.media_url.startsWith('http')) {
                  if (result.media_type === 'video') {
                    await sock.sendMessage(remoteJid, { video: { url: result.media_url }, caption: result.reply });
                    sentMedia = true;
                  } else {
                    await sock.sendMessage(remoteJid, { image: { url: result.media_url }, caption: result.reply });
                    sentMedia = true;
                  }
                }

                if (!sentMedia) {
                  await sock.sendMessage(remoteJid, { text: result.reply });
                }
              } catch (mediaErr) {
                addLog('warning', `Failed sending media attachment (${mediaErr.message}), falling back to text`);
                await sock.sendMessage(remoteJid, { text: result.reply });
              }
            } else {
              await sock.sendMessage(remoteJid, { text: result.reply });
            }
            addLog('success', `🤖 Replied to +${senderPhone} [${result.type}]: "${result.reply.substring(0, 60)}..."`);
          } else if (result && result.type === 'OUTSIDE_KB_SILENT') {
            addLog('info', `Query from +${senderPhone} is outside Business Knowledge Base. Bot remained silent (zero hallucinations).`);
          } else if (result && result.type === 'HUMAN_TAKEOVER_ACTIVE') {
            addLog('info', `Human takeover active for +${senderPhone}. Automated reply suppressed.`);
          } else if (result && result.type === 'SETUP_REQUIRED') {
            addLog('info', `Automated reply paused for +${senderPhone}: Business details have not been configured yet.`);
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
    try {
      if (fs.existsSync(SESSION_INFO_FILE)) {
        fs.unlinkSync(SESSION_INFO_FILE);
      }
    } catch (e) {}
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

    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
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

// GET all users and system metrics (Admin only)
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

// GET single user by ID (Admin only)
app.get(['/api/admin/users/:id', '/admin/users/:id'], authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user = await findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update user details (Admin only)
app.put(['/api/admin/users/:id', '/admin/users/:id'], authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, status, password } = req.body;
    
    const existing = await findUserById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const updates = {};
    if (name) updates.name = name.trim();
    if (email) updates.email = email.toLowerCase().trim();
    if (role && (role === 'ADMIN' || role === 'USER')) updates.role = role;
    if (status && (status === 'ACTIVE' || status === 'SUSPENDED')) updates.status = status;
    if (password && password.length >= 6) {
      updates.password = await bcrypt.hash(password, 10);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields provided for update' });
    }

    const updatedUser = await updateUser(id, updates);
    addLog('info', `Admin updated user #${id} details: ${Object.keys(updates).join(', ')}`);
    res.json({ success: true, message: 'User updated successfully', user: updatedUser });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Toggle user status (Activate / Suspend) - Supports both PUT and POST
const handleUserStatus = async (req, res) => {
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
};
app.put(['/api/admin/user-status', '/admin/user-status'], authenticateToken, requireAdmin, handleUserStatus);
app.post(['/api/admin/user-status', '/admin/user-status'], authenticateToken, requireAdmin, handleUserStatus);

// DELETE user (Admin only)
app.delete(['/api/admin/users/:id', '/admin/users/:id'], authenticateToken, requireAdmin, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (String(req.user.id) === String(targetId)) {
      return res.status(400).json({ success: false, error: 'Cannot delete your own active administrator account.' });
    }
    const existing = await findUserById(targetId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    await deleteUser(targetId);
    addLog('warning', `Admin deleted user #${targetId} (${existing.email})`);
    res.json({ success: true, message: `User #${targetId} deleted successfully` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete(['/api/admin/users', '/admin/users'], authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'Missing userId' });
    }
    if (String(req.user.id) === String(userId)) {
      return res.status(400).json({ success: false, error: 'Cannot delete your own active administrator account.' });
    }
    const existing = await findUserById(userId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    await deleteUser(userId);
    addLog('warning', `Admin deleted user #${userId} (${existing.email})`);
    res.json({ success: true, message: `User #${userId} deleted successfully` });
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
    const { 
      business_profile, 
      website_url, 
      keyword_pairs, 
      auto_reply_enabled, 
      welcome_msg_enabled, 
      welcome_message,
      welcome_media_url,
      welcome_media_type,
      welcome_options,
      outside_kb_action, 
      fallback_message 
    } = req.body;
    
    const current = getBusinessSettings();
    const updated = {
      ...current,
      business_profile: typeof business_profile === 'string' ? business_profile : current.business_profile,
      website_url: typeof website_url === 'string' ? website_url : current.website_url,
      auto_reply_enabled: auto_reply_enabled !== undefined ? Boolean(auto_reply_enabled) : current.auto_reply_enabled,
      welcome_msg_enabled: welcome_msg_enabled !== undefined ? Boolean(welcome_msg_enabled) : current.welcome_msg_enabled,
      welcome_message: typeof welcome_message === 'string' ? welcome_message : (current.welcome_message || DEFAULT_SETTINGS.welcome_message),
      welcome_media_url: typeof welcome_media_url === 'string' ? welcome_media_url : (current.welcome_media_url || ''),
      welcome_media_type: typeof welcome_media_type === 'string' ? welcome_media_type : (current.welcome_media_type || 'image'),
      welcome_options: Array.isArray(welcome_options) 
        ? welcome_options.filter(o => o && typeof o.title === 'string' && o.title.trim().length > 0)
        : (current.welcome_options || DEFAULT_SETTINGS.welcome_options),
      outside_kb_action: typeof outside_kb_action === 'string' ? outside_kb_action : current.outside_kb_action,
      fallback_message: typeof fallback_message === 'string' ? fallback_message : current.fallback_message,
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
    addLog('info', 'Business Profile, Media Attachments & Targeting Keywords saved successfully.');
    res.json({ success: true, message: 'Settings saved successfully', settings: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Media Upload Endpoint (Images, Videos, Catalogs / PDFs)
app.post('/api/upload-media', uploadMedia.single('mediaFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No media file provided.' });
    }
    const relativeUrl = `/uploads/${req.file.filename}`;
    let mediaType = 'document';
    if (req.file.mimetype.startsWith('image/')) mediaType = 'image';
    else if (req.file.mimetype.startsWith('video/')) mediaType = 'video';

    addLog('info', `Uploaded media attachment: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB) -> ${relativeUrl}`);
    res.json({
      success: true,
      url: relativeUrl,
      mediaType,
      filename: req.file.originalname,
      size: req.file.size
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

// 7. Interactive Bot Simulator / Preview Sandbox Endpoint
app.post(['/api/simulate-reply', '/simulate-reply'], async (req, res) => {
  try {
    const { query, phone, name } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ success: false, error: 'Query text is required.' });
    }
    const simPhone = phone || ('9199' + Math.floor(10000000 + Math.random() * 90000000));
    const result = await processInboundText(query.trim(), simPhone, name || 'Test Lead');
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Measurable ROI & Lead Inbox Analytics Endpoint
app.get(['/api/leads-analytics', '/leads-analytics'], (req, res) => {
  try {
    const leads = getLeads();
    const escalations = getEscalations();
    const optouts = getOptOuts();

    const totalLeads = leads.length;
    const totalInquiries = leads.reduce((acc, l) => acc + (l.totalMessages || 1), 0);
    const activeEscalationsCount = Object.keys(escalations).length;
    const aiHandledCount = leads.filter(l => l.status === 'AI_HANDLED').length;
    const optedOutCount = optouts.length;

    // Intent counts
    const intentCounts = {};
    leads.forEach(l => {
      const intent = l.matchedIntent || 'General';
      intentCounts[intent] = (intentCounts[intent] || 0) + 1;
    });
    const topKeywords = Object.entries(intentCounts)
      .map(([k, v]) => ({ keyword: k, count: v, pct: Math.round((v / (totalLeads || 1)) * 100) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Support time saved calculation (avg 3.5 mins per inquiry)
    const hoursSaved = Math.round(((totalInquiries * 3.5) / 60) * 10) / 10;

    res.json({
      success: true,
      summary: {
        totalLeads,
        totalInquiries,
        aiHandledCount,
        activeEscalationsCount,
        optedOutCount,
        hoursSaved,
        topKeywords
      },
      escalations: Object.values(escalations),
      leads: leads.slice(0, 50)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Resolve Escalation & Resume Bot for Contact
app.post(['/api/escalations/resolve', '/escalations/resolve'], (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, error: 'Phone is required.' });
    resolveEscalation(phone);
    
    // Update lead status
    const leads = getLeads();
    const clean = String(phone).replace(/\D/g, '');
    const lead = leads.find(l => l.phone === clean);
    if (lead) {
      lead.status = 'AI_HANDLED';
      saveLeads(leads);
    }

    addLog('info', `Human takeover resolved for +${clean}. Bot automated replies resumed.`);
    res.json({ success: true, message: `Bot resumed for +${clean}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Opt-Outs Blacklist Manager
app.get(['/api/optouts', '/optouts'], (req, res) => {
  res.json({ success: true, optouts: getOptOuts() });
});

app.post(['/api/optouts/remove', '/optouts/remove'], (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, error: 'Phone is required.' });
    removeOptOut(phone);
    addLog('info', `Phone +${phone} removed from Opt-Out blacklist.`);
    res.json({ success: true, message: `+${phone} removed from Opt-Out blacklist.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11. Anti-Ban Campaign Broadcast Endpoint (Randomized Socket Jitter & Opt-Out Filter)
app.post(['/api/broadcast', '/broadcast'], async (req, res) => {
  try {
    if (connectionStatus !== 'CONNECTED' || !sock) {
      return res.status(503).json({ success: false, error: 'WhatsApp device not connected.' });
    }
    const { recipients, templateMessage, minDelayMs = 4000, maxDelayMs = 8000 } = req.body;
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ success: false, error: 'Recipients list is required.' });
    }
    if (!templateMessage || !templateMessage.trim()) {
      return res.status(400).json({ success: false, error: 'Template message is required.' });
    }

    const total = recipients.length;
    addLog('info', `🚀 Starting Broadcast Campaign to ${total} recipients with anti-ban socket pacing (${minDelayMs / 1000}s - ${maxDelayMs / 1000}s)...`);

    // Async batch execution with randomized jitter
    (async () => {
      let sent = 0;
      let skippedOptOut = 0;
      let failed = 0;

      for (let i = 0; i < recipients.length; i++) {
        const r = recipients[i];
        const rawPhone = r.phone || r.Phone || (typeof r === 'string' ? r : '');
        let cleanNumber = String(rawPhone).replace(/\D/g, '');
        if (cleanNumber.length === 10) cleanNumber = '91' + cleanNumber;
        
        if (!cleanNumber || cleanNumber.length < 8) {
          failed++;
          continue;
        }

        if (isOptedOut(cleanNumber)) {
          skippedOptOut++;
          addLog('info', `🛡️ Skipped +${cleanNumber}: In Opt-Out Blacklist (Anti-Spam safeguard).`);
          continue;
        }

        let msgText = templateMessage;
        const name = r.name || r.Name || 'Valued Customer';
        msgText = msgText.replace(/\{\{Name\}\}/gi, name);
        msgText = msgText.replace(/\{\{Phone\}\}/gi, '+' + cleanNumber);

        try {
          const jid = `${cleanNumber}@s.whatsapp.net`;
          await sock.sendMessage(jid, { text: msgText });
          sent++;
          addLog('success', `Campaign (${i + 1}/${total}) sent to +${cleanNumber}`);
        } catch (e) {
          failed++;
          addLog('error', `Campaign send error to +${cleanNumber}: ${e.message}`);
        }

        // Anti-Ban socket jitter between messages
        if (i < recipients.length - 1) {
          const jitter = Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
          await new Promise(resolve => setTimeout(resolve, jitter));
        }
      }
      addLog('success', `🎉 Broadcast Campaign completed: ${sent} Sent, ${skippedOptOut} Opt-Outs Skipped, ${failed} Failed.`);
    })();

    res.json({
      success: true,
      message: `Broadcast campaign started for ${total} contacts with anti-ban jitter (${minDelayMs / 1000}s - ${maxDelayMs / 1000}s). Track progress in Activity Feed.`,
      recipientCount: total
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
