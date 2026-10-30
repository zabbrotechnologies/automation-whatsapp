// ==========================================================
// WHATSAPP GATEWAY CONTROLLER
// ==========================================================

let currentDisplayedQR = null;
let autoRefreshTimer = null;
let isAutoRefresh = false; // Default: AUTO-REFRESH IS OFF

// DOM Elements
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const qrSection = document.getElementById('qrSection');
const qrImage = document.getElementById('qrImage');
const qrLoading = document.getElementById('qrLoading');
const refreshQrBtn = document.getElementById('refreshQrBtn');
const connectedSection = document.getElementById('connectedSection');
const connectedPhone = document.getElementById('connectedPhone');
const logoutBtn = document.getElementById('logoutBtn');
const testForm = document.getElementById('testMessageForm');
const testAlert = document.getElementById('testAlert');
const sendBtn = document.getElementById('sendBtn');
const logsContainer = document.getElementById('logsContainer');
const apiEndpointUrl = document.getElementById('apiEndpointUrl');
const apiSecretDisplay = document.getElementById('apiSecretDisplay');
const manualRefreshBtn = document.getElementById('manualRefreshBtn');
const syncBtnText = document.getElementById('syncBtnText');
const autoRefreshToggle = document.getElementById('autoRefreshToggle');
const autoRefreshLabel = document.getElementById('autoRefreshLabel');
const lastUpdatedSpan = document.getElementById('lastUpdated');
const kpiGatewayStatus = document.getElementById('kpiGatewayStatus');
const logModeTag = document.getElementById('logModeTag');
const clearLogsBtn = document.getElementById('clearLogsBtn');

// Automatically configure API URL based on current host
const hostUrl = window.location.origin;
apiEndpointUrl.textContent = `${hostUrl}/api/send`;

// Update Last Synced Time
function updateTimestamp() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (lastUpdatedSpan) {
    lastUpdatedSpan.textContent = timeStr;
  }
}

// Check Gateway Status
async function checkStatus(isManual = false) {
  const syncIcon = manualRefreshBtn?.querySelector('.sync-icon');
  
  if (isManual && syncIcon) {
    syncIcon.classList.add('rotating');
    if (syncBtnText) syncBtnText.textContent = 'Syncing...';
    manualRefreshBtn.disabled = true;
  }

  try {
    const res = await fetch('/api/status', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const data = await res.json();
    renderState(data);
    updateTimestamp();
  } catch (err) {
    statusBadge.className = 'status-pill disconnected';
    statusText.textContent = 'Server Offline';
    if (kpiGatewayStatus) kpiGatewayStatus.textContent = 'Offline';
    appendLog('error', `Could not reach gateway server: ${err.message}`);
  } finally {
    if (isManual && syncIcon) {
      setTimeout(() => {
        syncIcon.classList.remove('rotating');
        if (syncBtnText) syncBtnText.textContent = 'Sync Now';
        manualRefreshBtn.disabled = false;
      }, 400);
    }
  }
}

// Render Dashboard UI State
function renderState(data) {
  const { status, qr, user, logs } = data;

  if (status === 'CONNECTED') {
    statusBadge.className = 'status-pill connected';
    statusText.textContent = 'Connected';
    if (kpiGatewayStatus) kpiGatewayStatus.textContent = 'Active (Linked)';
    
    qrSection.classList.add('hidden');
    connectedSection.classList.remove('hidden');
    connectedPhone.textContent = user?.phone ? `+${user.phone}` : 'Connected';
    currentDisplayedQR = null;
  } else if (status === 'QR_READY' && qr) {
    statusBadge.className = 'status-pill qr';
    statusText.textContent = 'Scan QR Code';
    if (kpiGatewayStatus) kpiGatewayStatus.textContent = 'Scan Required';
    
    connectedSection.classList.add('hidden');
    qrSection.classList.remove('hidden');
    
    // Only update image src if QR changed to prevent visual flickers
    if (currentDisplayedQR !== qr) {
      currentDisplayedQR = qr;
      qrImage.src = qr;
      qrImage.classList.add('visible');
      qrLoading.style.display = 'none';
    }
  } else {
    statusBadge.className = 'status-pill initializing';
    statusText.textContent = 'Initializing...';
    if (kpiGatewayStatus) kpiGatewayStatus.textContent = 'Initializing...';
    
    connectedSection.classList.add('hidden');
    qrSection.classList.remove('hidden');
    if (!currentDisplayedQR) {
      qrImage.classList.remove('visible');
      qrLoading.style.display = 'flex';
    }
  }

  // Render logs
  if (logs && logs.length > 0) {
    logsContainer.innerHTML = logs.map(l => 
      `<div class="log-line ${l.type}">
        <span class="log-time">[${l.time}]</span> 
        <span>${escapeHtml(l.message)}</span>
      </div>`
    ).join('');
  }
}

// Auto-Refresh Manager (Off by default)
function setAutoRefresh(enable) {
  isAutoRefresh = enable;
  if (autoRefreshToggle) autoRefreshToggle.checked = enable;

  if (enable) {
    if (autoRefreshLabel) {
      autoRefreshLabel.innerHTML = 'Auto-refresh: <span class="badge-on">ON</span>';
    }
    if (logModeTag) logModeTag.textContent = 'Auto-Sync Active (3s)';
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(() => checkStatus(false), 3000);
  } else {
    if (autoRefreshLabel) {
      autoRefreshLabel.innerHTML = 'Auto-refresh: <span class="badge-off">OFF</span>';
    }
    if (logModeTag) logModeTag.textContent = 'Manual Sync Mode';
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }
  }
}

// Auto-Refresh Toggle Event
if (autoRefreshToggle) {
  autoRefreshToggle.addEventListener('change', (e) => {
    setAutoRefresh(e.target.checked);
  });
}

// Manual Refresh Event
if (manualRefreshBtn) {
  manualRefreshBtn.addEventListener('click', () => {
    checkStatus(true);
  });
}

// Clear Logs Button
if (clearLogsBtn) {
  clearLogsBtn.addEventListener('click', () => {
    logsContainer.innerHTML = `<div class="log-line info"><span class="log-time">[Console]</span> Console view cleared by user.</div>`;
  });
}

// Copy to Clipboard with Visual Confirmation
document.querySelectorAll('.btn-copy').forEach(button => {
  button.addEventListener('click', () => {
    const targetId = button.getAttribute('data-target');
    const targetElement = document.getElementById(targetId);
    if (!targetElement) return;

    const textToCopy = targetElement.textContent.trim();
    navigator.clipboard.writeText(textToCopy).then(() => {
      const originalHTML = button.innerHTML;
      button.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <span>Copied!</span>`;
      button.classList.add('copied');

      const hintElem = document.getElementById(`hint-${targetId}`);
      if (hintElem) hintElem.textContent = '✓ Copied to clipboard';

      setTimeout(() => {
        button.innerHTML = originalHTML;
        button.classList.remove('copied');
        if (hintElem) hintElem.textContent = 'Click copy';
      }, 2000);
    }).catch(err => {
      alert('Unable to copy: ' + err.message);
    });
  });
});

// Disconnect / Logout
logoutBtn.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to disconnect this WhatsApp session?')) return;
  try {
    logoutBtn.disabled = true;
    logoutBtn.innerHTML = `
      <div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>
      Disconnecting Session...`;
    
    await fetch('/api/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'secret123' })
    });
    
    setTimeout(() => {
      logoutBtn.disabled = false;
      logoutBtn.innerHTML = `
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Disconnect Device Session`;
      checkStatus(true);
    }, 1500);
  } catch (e) {
    alert('Error logging out: ' + e.message);
    logoutBtn.disabled = false;
  }
});

// Test Message Sender
testForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const phone = document.getElementById('testPhone').value.trim();
  const message = document.getElementById('testMessage').value.trim();

  testAlert.className = 'alert hidden';
  sendBtn.disabled = true;
  sendBtn.innerHTML = `
    <div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>
    <span>Sending message...</span>`;

  try {
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'secret123'
      },
      body: JSON.stringify({ phone, message })
    });

    const data = await res.json();

    if (data.success) {
      testAlert.className = 'alert success';
      testAlert.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span>Message dispatched successfully! (ID: ${escapeHtml(data.messageId)})</span>`;
      document.getElementById('testMessage').value = '';
    } else {
      testAlert.className = 'alert error';
      testAlert.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>Failed: ${escapeHtml(data.error)}</span>`;
    }
  } catch (err) {
    testAlert.className = 'alert error';
    testAlert.innerHTML = `<span>Network Error: ${escapeHtml(err.message)}</span>`;
  } finally {
    sendBtn.disabled = false;
    sendBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="22" y1="2" x2="11" y2="13"/>
        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
      <span>Transmit Message</span>`;
    checkStatus(false);
  }
});

// Manual QR Refresh
refreshQrBtn.addEventListener('click', async () => {
  refreshQrBtn.disabled = true;
  refreshQrBtn.innerHTML = `
    <div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>
    <span>Generating fresh QR...</span>`;
  
  qrImage.classList.remove('visible');
  qrLoading.style.display = 'flex';
  currentDisplayedQR = null;

  try {
    const res = await fetch('/api/refresh-qr', { method: 'POST' });
    const data = await res.json();
    if (!data.success && data.error) {
      alert(data.error);
    }
    setTimeout(() => checkStatus(true), 1200);
  } catch (err) {
    alert('Failed to refresh QR: ' + err.message);
  } finally {
    setTimeout(() => {
      refreshQrBtn.disabled = false;
      refreshQrBtn.innerHTML = `
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6"/>
          <path d="M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
        Request New QR Code`;
    }, 2000);
  }
});

function appendLog(type, message) {
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  line.innerHTML = `<span class="log-time">[${now}]</span> <span>${escapeHtml(message)}</span>`;
  logsContainer.prepend(line);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Google Sheet Link Preview Helper
const btnPreviewSheet = document.getElementById('btnPreviewSheet');
const sheetUrlInput = document.getElementById('sheetUrlInput');

if (btnPreviewSheet && sheetUrlInput) {
  btnPreviewSheet.addEventListener('click', async () => {
    const rawUrl = sheetUrlInput.value.trim();
    if (!rawUrl) {
      alert('Please paste a valid Google Sheet URL first.');
      sheetUrlInput.focus();
      return;
    }

    // Extract spreadsheet ID: https://docs.google.com/spreadsheets/d/{ID}/...
    const match = rawUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match || !match[1]) {
      alert('Invalid Google Sheet URL format. Make sure it looks like:\nhttps://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit');
      return;
    }

    const sheetId = match[1];
    const csvExportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;

    btnPreviewSheet.disabled = true;
    btnPreviewSheet.innerHTML = `
      <div class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:#ffffff;"></div>
      <span>Fetching CSV...</span>`;

    try {
      const res = await fetch(csvExportUrl);
      if (!res.ok) {
        throw new Error(`Google returned status ${res.status}. Please make sure sheet sharing is set to "Anyone with the link can view"`);
      }
      const csvText = await res.text();
      const rows = csvText.split('\n').filter(r => r.trim().length > 0);
      const totalContacts = Math.max(0, rows.length - 1); // Minus header row
      
      alert(`✅ Success! Sheet connected.\n• Total contact rows detected: ${totalContacts}\n• CSV Endpoint: Active and ready for broadcasting.`);
      appendLog('success', `Google Sheet loaded (${totalContacts} contacts detected)`);
    } catch (err) {
      alert(`⚠️ Could not parse sheet:\n${err.message}\n\nTip: In Google Sheets, click "Share" (top-right) and set access to "Anyone with the link can view".`);
      appendLog('error', `Sheet fetch failed: ${err.message}`);
    } finally {
      btnPreviewSheet.disabled = false;
      btnPreviewSheet.innerHTML = `<span>Parse &amp; Preview Sheet</span>`;
    }
  });
}

// Parallax Scroll Effect for Hero Sky Background
const parallaxBg = document.getElementById('parallaxBg');
if (parallaxBg) {
  let latestScrollY = 0;
  let ticking = false;

  function updateParallax() {
    // Moves sky at ~35% scroll speed for authentic atmospheric depth
    const offset = latestScrollY * 0.35;
    parallaxBg.style.transform = `translate3d(0, ${offset}px, 0)`;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    latestScrollY = window.pageYOffset || document.documentElement.scrollTop;
    if (!ticking) {
      window.requestAnimationFrame(updateParallax);
      ticking = true;
    }
  }, { passive: true });
}

// Initial single status fetch on load (Auto-refresh remains strictly OFF)
setAutoRefresh(false);
checkStatus(false);

