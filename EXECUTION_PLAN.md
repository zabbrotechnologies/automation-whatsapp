# 🚀 WhatsApp Enterprise Automation & AI Gateway — Execution Blueprint

A comprehensive, production-ready specification and step-by-step implementation roadmap for building a unified **WhatsApp Marketing, Sheet Broadcasting & AI Auto-Reply Suite**.

---

## 📑 Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Feature Matrix](#2-feature-matrix)
3. [System Architecture & Data Flow](#3-system-architecture--data-flow)
4. [Feature Breakdown & Technical Specifications](#4-feature-breakdown--technical-specifications)
   - [A. WhatsApp Device Linking (Baileys Multi-Device)](#a-whatsapp-device-linking-baileys-multi-device)
   - [B. Direct Google Sheet Broadcast (No Apps Script Required)](#b-direct-google-sheet-broadcast-no-apps-script-required)
   - [C. Automated Welcome Messaging](#c-automated-welcome-messaging)
   - [D. AI-Powered Auto-Reply Engine (OpenRouter Free Tier)](#d-ai-powered-auto-reply-engine-openrouter-free-tier)
   - [E. Anti-Ban Safeguards & Rate Limiting](#e-anti-ban-safeguards--rate-limiting)
   - [F. Unified Dashboard UI Controls](#f-unified-dashboard-ui-controls)
5. [Implementation Milestones & Execution Plan](#5-implementation-milestones--execution-plan)
6. [Environment Variables & Configuration](#6-environment-variables--configuration)

---

## 1. Executive Summary

This architecture transforms a basic WhatsApp gateway into a **full-suite automated sales and customer support platform**. It eliminates technical barriers for non-technical users by allowing them to:
1. **Link any WhatsApp account** in seconds via standard QR code without risk of meta account deletion.
2. **Broadcast to thousands of contacts** by simply pasting a public Google Sheet link directly into the web dashboard without installing scripts or writing code.
3. **Greet new leads automatically** with personalized welcome messages on their very first interaction.
4. **Answer inbound inquiries 24/7** using state-of-the-art open-source AI models (Google Gemma, NVIDIA Nemotron, Meta Llama) via OpenRouter’s free tier.

---

## 2. Feature Matrix

| Feature | Description | Technical Driver | User Complexity |
| :--- | :--- | :--- | :--- |
| **Device Linking** | Scan QR code on web to link any personal or business number. | Baileys multi-device socket | ⭐️ Zero (Just camera scan) |
| **G-Sheet Broadcast** | Paste public sheet link, preview contacts, and send bulk messages. | Google Sheets CSV export parser | ⭐️ Paste URL & click send |
| **Dynamic Templates** | Replace variables like `{Name}`, `{OrderNo}`, `{Amount}` per row. | String token interpolator | ⭐️ Standard tags |
| **Auto Welcome Message** | Instant greeting sent to new numbers on their first message. | In-memory / JSON contact history | ⭐️ Set greeting text once |
| **AI Auto-Reply** | Intelligent 24/7 Q&A powered by free LLMs with business prompt. | OpenRouter API (`:free` models) | ⭐️ Add prompt & toggle ON |
| **Anti-Ban Protection** | Random interval jitter (2–5s) and rate throttling. | Async sleep queue manager | ⭐️ Automatic |
| **Web Dashboard** | Executive dark UI with toggles, progress bars, and live logs. | Vanilla HTML/CSS/JS (Lightweight) | ⭐️ Browser-based |

---

## 3. System Architecture & Data Flow

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        WEB DASHBOARD (Client UI)                       │
│  [Device QR View]  │  [Paste G-Sheet URL]  │  [AI & Welcome Controls]  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP API Requests
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      NODE.JS BACKEND ENGINE                            │
│                                                                        │
│  ┌───────────────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │ Google Sheet Importer │  │ Broadcast Queue │  │ Baileys WA Socket│  │
│  │ (CSV Fetch & Parser)  │  │ (Anti-Ban Jitter│  │ (Multi-Device)   │  │
│  └───────────────────────┘  └─────────────────┘  └─────────┬────────┘  │
│                                                            │           │
│  ┌─────────────────────────────────────────────────────────┴────────┐  │
│  │               Incoming Message Dispatcher & Router               │  │
│  │   - Filters: Ignore self, groups, status updates                 │  │
│  │   - First-time sender check ──► Trigger Welcome Message          │  │
│  │   - Query handling          ──► Send to OpenRouter LLM           │  │
│  └────────────────────────┬─────────────────────────────────────────┘  │
└───────────────────────────┼────────────────────────────────────────────┘
                            │
               ┌────────────┴────────────┐
               ▼                         ▼
      ┌──────────────────┐     ┌──────────────────┐
      │  WhatsApp Phone  │     │  OpenRouter API  │
      │ (Customer Chats) │     │  (Gemma/Nemotron)│
      └──────────────────┘     └──────────────────┘
```

---

## 4. Feature Breakdown & Technical Specifications

### A. WhatsApp Device Linking (Baileys Multi-Device)
* **Goal**: Establish a continuous, persistent session using WhatsApp’s native "Linked Devices" feature.
* **Mechanism**:
  - Node.js backend initializes an authentication session using `useMultiFileAuthState`.
  - When disconnected or unauthenticated, server produces an encrypted QR code string and renders it as an SVG/Data-URL on the dashboard.
  - Session credentials save locally in `./session_auth` to survive server restarts.
* **Safety**: Does not use unauthorized modified WhatsApp APKs; connects as a recognized companion web client.

---

### B. Direct Google Sheet Broadcast (No Apps Script Required)
* **Goal**: Enable non-technical users to broadcast messages without opening Google Apps Script.
* **Mechanism**:
  1. User inputs a Google Sheet URL:
     `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit#gid=0`
  2. Frontend/Backend extracts `{SPREADSHEET_ID}` and requests:
     `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/export?format=csv`
     *(Requirement: Sheet must be shared as "Anyone with link can view")*
  3. The parser parses headers (`Name`, `Phone`, `Param1`, `Param2`).
  4. Live Preview table renders in the dashboard:
     - Total contacts detected
     - Cleaned telephone numbers (stripping spaces, brackets, hyphens)
     - Message sample preview
  5. The user clicks **"Start Broadcast"**:
     - System iterates sequentially over contacts.
     - Replaces `{Name}` with contact’s actual name.
     - Dispatches via `sock.sendMessage()`.
     - Displays live progress bar (`Sent 12 / 100`).

---

### C. Automated Welcome Messaging
* **Goal**: Automatically greet any customer who reaches out to the business number for the first time.
* **Mechanism**:
  - The server maintains a persistent list of known phone numbers (e.g., `known_contacts.json`).
  - When an incoming message arrives via `sock.ev.on('messages.upsert')`:
    1. Check if the sender’s number exists in `known_contacts.json`.
    2. If **New Sender** and `AUTO_WELCOME_ENABLED = true`:
       - Record the number in the database with first contact timestamp.
       - Send the configured Welcome Message immediately:
         > *"Hello! 👋 Welcome to [Business Name]. How can we assist you today? Our AI assistant or support team will respond shortly."*
    3. If **Existing Sender**: Skip welcome message and pass directly to the AI query responder.

---

### D. AI-Powered Auto-Reply Engine (OpenRouter Free Tier)
* **Goal**: Answer incoming user questions 24/7 with zero operational cost using OpenRouter's free models.
* **Recommended Free Models**:
  - `google/gemma-2-9b-it:free` (Fast, high comprehension, Tamil/English bilingual proficiency)
  - `nvidia/llama-3.1-nemotron-70b-instruct:free` (Superb conversational tone, best for customer care)
  - `meta-llama/llama-3.3-70b-instruct:free` (Deep reasoning, handles complex catalogs and policy FAQs)
* **Mechanism**:
  1. Extract incoming text query: `m.message?.conversation || m.message?.extendedTextMessage?.text`.
  2. Construct prompt payload:
     - **System Prompt**: Embeds company catalog, store hours, pricing, delivery policies, and tone instructions.
     - **User Prompt**: Customer's exact message.
  3. Send POST request to `https://openrouter.ai/api/v1/chat/completions`.
  4. Receive generated reply and transmit to the customer's WhatsApp chat.
* **Smart Guardrails**:
  - **Group Filter**: Automatically ignores messages ending with `@g.us` (WhatsApp Groups) so the AI never interrupts group conversations.
  - **Self Filter**: Ignores messages marked `fromMe: true`.
  - **Fallback**: If AI is confused or model fails, send a polite fallback: *"Thank you for your message. An executive will get back to you shortly."*

---

### E. Anti-Ban Safeguards & Rate Limiting
To protect the linked WhatsApp account from automated spam flags:
1. **Dynamic Jitter Delay**: Inserts a randomized pause of `2.5 to 5.0 seconds` between broadcast messages.
2. **Chunking**: For large lists (>100 contacts), automatically pauses for `60 seconds` every 50 messages.
3. **Number Cleansing**: Validates international dialing prefix (e.g., `91` for India, `1` for US) to avoid delivering to invalid JIDs.

---

### F. Unified Dashboard UI Controls
The web interface includes dedicated cards for each capability:
1. **Connection Card**: QR pairing box, active phone number badge, disconnect button.
2. **Direct Sheet Broadcast Card**:
   - Google Sheet Link input field
   - Dynamic message template box with `{Name}`, `{Param1}` tag chips
   - Contact Preview modal with send progress bar
3. **Automated Messaging Configuration Card**:
   - Welcome Message toggle (ON/OFF) + Custom text editor
   - AI Auto-Reply toggle (ON/OFF)
   - OpenRouter Model selector (`gemma-2-9b:free`, `nemotron-70b:free`, etc.)
   - System Prompt / Business Knowledge text box
4. **Live Activity Console**:
   - Color-coded logs displaying outgoing broadcasts, incoming queries, and AI generation timestamps.

---

## 5. Implementation Milestones & Execution Plan

```text
Phase 1: Backend Services Expansion
  ├── 1.1: Add OpenRouter API client helper in server.js
  ├── 1.2: Add Google Sheet CSV fetcher & parser endpoint (/api/parse-sheet)
  ├── 1.3: Create contact tracker for First-Time Welcome message detection
  └── 1.4: Implement incoming message dispatcher (Welcome vs. AI Responder)

Phase 2: Broadcast Queue Engine
  ├── 2.1: Implement bulk send endpoint (/api/broadcast) with jitter delay
  └── 2.2: Add pause/cancel broadcast hooks and progress event stream

Phase 3: Dashboard Frontend Integration
  ├── 3.1: Build Google Sheet Broadcast section with live preview
  ├── 3.2: Build Welcome Message & AI Assistant control card
  └── 3.3: Wire real-time progress indicators and toggles

Phase 4: Testing & Deployment
  ├── 4.1: Test welcome message on new numbers
  ├── 4.2: Test AI queries using free OpenRouter models
  ├── 4.3: Test bulk sheet broadcast with sample list
  └── 4.4: Deploy updated bundle to Render / Cloud Server
```

---

## 6. Environment Variables & Configuration

Create or update `.env`:

```env
# Server Config
PORT=3000
API_SECRET=your_secret_password_here

# OpenRouter AI Configuration
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENROUTER_MODEL=google/gemma-2-9b-it:free
OPENROUTER_SITE_URL=https://my-whatsapp-gateway.onrender.com
OPENROUTER_SITE_NAME=WhatsApp Gateway AI

# Automation Settings
ENABLE_AUTO_WELCOME=true
WELCOME_MESSAGE=Hello! 👋 Thanks for reaching out. How can we help you today?
ENABLE_AI_REPLY=true
AI_SYSTEM_PROMPT=You are a professional customer support assistant. Answer politely and concisely.
```

---

## 7. Conclusion

By integrating **Direct Sheet Link parsing** and **OpenRouter Free AI models** with the existing **Baileys Gateway**, you create an end-to-end, zero-cost WhatsApp marketing machine that requires zero technical setup from the end user while operating autonomously 24/7.
