// ==========================================================
// WHATSAPP GATEWAY CONTROLLER (HORIZON MINIMALIST THEME)
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
const logsContainer = document.getElementById('logsContainer');
const apiEndpointUrl = document.getElementById('apiEndpointUrl');
const apiSecretDisplay = document.getElementById('apiSecretDisplay');
const manualRefreshBtn = document.getElementById('manualRefreshBtn');
const autoRefreshToggle = document.getElementById('autoRefreshToggle');
const autoRefreshLabel = document.getElementById('autoRefreshLabel');
const lastUpdatedSpan = document.getElementById('lastUpdated');
const kpiGatewayStatus = document.getElementById('kpiGatewayStatus');
const gatewayStatusText = document.getElementById('gatewayStatusText');
const logModeTag = document.getElementById('logModeTag');
const clearLogsBtn = document.getElementById('clearLogsBtn');

// Automatically configure API URL based on current host
const hostUrl = window.location.origin;
if (apiEndpointUrl) {
  apiEndpointUrl.textContent = `${hostUrl}/api/send`;
}

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
    if (manualRefreshBtn) manualRefreshBtn.disabled = true;
  }

  try {
    const res = await fetch('/api/status', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const data = await res.json();
    renderState(data);
    updateTimestamp();
  } catch (err) {
    if (statusBadge) statusBadge.className = 'status-pill disconnected';
    if (statusText) statusText.textContent = 'Server Offline';
    if (kpiGatewayStatus) kpiGatewayStatus.textContent = 'Offline';
    if (gatewayStatusText) gatewayStatusText.textContent = 'Server unreachable';
    appendLog('error', `Could not reach gateway server: ${err.message}`);
  } finally {
    if (isManual && syncIcon) {
      setTimeout(() => {
        syncIcon.classList.remove('rotating');
        if (manualRefreshBtn) manualRefreshBtn.disabled = false;
      }, 400);
    }
  }
}

// Render Dashboard UI State
function renderState(data) {
  const { status, qr, user, logs } = data;

  if (status === 'CONNECTED') {
    if (statusBadge) statusBadge.className = 'status-pill connected';
    if (statusText) statusText.textContent = 'Connected';
    if (kpiGatewayStatus) {
      kpiGatewayStatus.textContent = 'Connected';
      kpiGatewayStatus.className = 'status-chip';
    }
    if (gatewayStatusText) gatewayStatusText.textContent = `Connected (+${user?.phone || 'Linked'})`;
    
    if (qrSection) qrSection.classList.add('hidden');
    if (connectedSection) connectedSection.classList.remove('hidden');
    if (connectedPhone) connectedPhone.textContent = user?.phone ? `+${user.phone}` : 'Connected';
    currentDisplayedQR = null;
  } else if (status === 'QR_READY' && qr) {
    if (statusBadge) statusBadge.className = 'status-pill qr';
    if (statusText) statusText.textContent = 'Scan QR';
    if (kpiGatewayStatus) {
      kpiGatewayStatus.textContent = 'QR Ready';
      kpiGatewayStatus.className = 'status-chip chip-neutral';
    }
    if (gatewayStatusText) gatewayStatusText.textContent = 'Awaiting WhatsApp QR scan';
    
    if (connectedSection) connectedSection.classList.add('hidden');
    if (qrSection) qrSection.classList.remove('hidden');
    
    // Only update image src if QR changed to prevent visual flickers
    if (currentDisplayedQR !== qr) {
      currentDisplayedQR = qr;
      if (qrImage) {
        qrImage.src = qr;
        qrImage.classList.add('visible');
      }
      if (qrLoading) qrLoading.style.display = 'none';
    }
  } else {
    if (statusBadge) statusBadge.className = 'status-pill initializing';
    if (statusText) statusText.textContent = 'Initializing...';
    if (kpiGatewayStatus) {
      kpiGatewayStatus.textContent = 'Initializing...';
      kpiGatewayStatus.className = 'status-chip chip-neutral';
    }
    if (gatewayStatusText) gatewayStatusText.textContent = 'Initializing Baileys handshake';
    
    if (connectedSection) connectedSection.classList.add('hidden');
    if (qrSection) qrSection.classList.remove('hidden');
    if (!currentDisplayedQR) {
      if (qrImage) qrImage.classList.remove('visible');
      if (qrLoading) qrLoading.style.display = 'flex';
    }
  }

  // Render logs
  if (logs && logs.length > 0 && logsContainer) {
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
      autoRefreshLabel.innerHTML = '<span class="badge-on">ON</span>';
    }
    if (logModeTag) logModeTag.textContent = 'Auto-Sync Active (3s)';
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(() => checkStatus(false), 3000);
  } else {
    if (autoRefreshLabel) {
      autoRefreshLabel.innerHTML = '<span class="badge-off">OFF</span>';
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
if (clearLogsBtn && logsContainer) {
  clearLogsBtn.addEventListener('click', () => {
    logsContainer.innerHTML = `<div class="log-line info"><span class="log-time">[Console]</span> Console view cleared by user.</div>`;
  });
}

// Copy to Clipboard with Visual Confirmation
document.querySelectorAll('.btn-copy-chip').forEach(button => {
  button.addEventListener('click', () => {
    const targetId = button.getAttribute('data-target');
    const targetElement = document.getElementById(targetId);
    if (!targetElement) return;

    const textToCopy = targetElement.textContent.trim();
    navigator.clipboard.writeText(textToCopy).then(() => {
      const originalHTML = button.innerHTML;
      button.innerHTML = `<span>Copied!</span>`;
      button.classList.add('copied');

      const hintElem = document.getElementById(`hint-${targetId}`);
      if (hintElem) hintElem.textContent = '✓ Copied';

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
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to disconnect this WhatsApp session?')) return;
    try {
      logoutBtn.disabled = true;
      logoutBtn.innerHTML = `
        <div class="minimal-spinner" style="width:14px;height:14px;border-width:2px;"></div>
        <span>Disconnecting...</span>`;
      
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'secret123' })
      });
      
      setTimeout(() => {
        logoutBtn.disabled = false;
        logoutBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span>Disconnect Session</span>`;
        checkStatus(true);
      }, 1500);
    } catch (e) {
      alert('Error logging out: ' + e.message);
      logoutBtn.disabled = false;
    }
  });
}

// Manual QR Refresh
if (refreshQrBtn) {
  refreshQrBtn.addEventListener('click', async () => {
    refreshQrBtn.disabled = true;
    refreshQrBtn.innerHTML = `
      <div class="minimal-spinner" style="width:14px;height:14px;border-width:2px;"></div>
      <span>Generating fresh QR...</span>`;
    
    if (qrImage) qrImage.classList.remove('visible');
    if (qrLoading) qrLoading.style.display = 'flex';
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6"/>
            <path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          <span>Request Fresh QR</span>`;
      }, 2000);
    }
  });
}

function appendLog(type, message) {
  if (!logsContainer) return;
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

// Initial single status fetch on load (Auto-refresh remains strictly OFF)
setAutoRefresh(false);
checkStatus(false);
