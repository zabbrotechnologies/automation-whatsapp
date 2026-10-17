// WhatsApp Gateway Dashboard Client
let currentStatus = '';

// Elements
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const qrSection = document.getElementById('qrSection');
const qrImage = document.getElementById('qrImage');
const qrLoading = document.getElementById('qrLoading');
const connectedSection = document.getElementById('connectedSection');
const connectedPhone = document.getElementById('connectedPhone');
const logoutBtn = document.getElementById('logoutBtn');
const testForm = document.getElementById('testMessageForm');
const testAlert = document.getElementById('testAlert');
const sendBtn = document.getElementById('sendBtn');
const logsContainer = document.getElementById('logsContainer');
const apiEndpointUrl = document.getElementById('apiEndpointUrl');

// Automatically set the real API URL based on browser host
const hostUrl = window.location.origin;
apiEndpointUrl.textContent = `${hostUrl}/api/send`;

// Poll Status
async function checkStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    renderState(data);
  } catch (err) {
    statusBadge.className = 'status-pill disconnected';
    statusText.textContent = 'Server Offline';
  }
}

function renderState(data) {
  const { status, qr, user, logs } = data;

  if (status === 'CONNECTED') {
    statusBadge.className = 'status-pill connected';
    statusText.textContent = 'Connected';
    qrSection.classList.add('hidden');
    connectedSection.classList.remove('hidden');
    connectedPhone.textContent = user?.phone ? `+${user.phone}` : 'Connected';
  } else if (status === 'QR_READY' && qr) {
    statusBadge.className = 'status-pill qr';
    statusText.textContent = 'Scan QR Code';
    connectedSection.classList.add('hidden');
    qrSection.classList.remove('hidden');
    qrImage.src = qr;
    qrImage.classList.add('visible');
    qrLoading.style.display = 'none';
  } else {
    statusBadge.className = 'status-pill qr';
    statusText.textContent = 'Initializing...';
    connectedSection.classList.add('hidden');
    qrSection.classList.remove('hidden');
    qrImage.classList.remove('visible');
    qrLoading.style.display = 'flex';
  }

  // Render logs
  if (logs && logs.length > 0) {
    logsContainer.innerHTML = logs.map(l => 
      `<div class="log-line ${l.type}">[${l.time}] ${escapeHtml(l.message)}</div>`
    ).join('');
  }
}

// Disconnect / Logout
logoutBtn.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to disconnect this WhatsApp number?')) return;
  try {
    logoutBtn.disabled = true;
    logoutBtn.textContent = 'Disconnecting...';
    await fetch('/api/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'secret123' })
    });
    setTimeout(() => {
      logoutBtn.disabled = false;
      logoutBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg> Disconnect Device`;
      checkStatus();
    }, 1500);
  } catch (e) {
    alert('Error logging out: ' + e.message);
  }
});

// Test Message Sender
testForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const phone = document.getElementById('testPhone').value.trim();
  const message = document.getElementById('testMessage').value.trim();

  testAlert.className = 'alert hidden';
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';

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
      testAlert.textContent = `✅ Sent successfully! (Message ID: ${data.messageId})`;
      document.getElementById('testMessage').value = '';
    } else {
      testAlert.className = 'alert error';
      testAlert.textContent = `❌ Failed: ${data.error}`;
    }
  } catch (err) {
    testAlert.className = 'alert error';
    testAlert.textContent = `❌ Network Error: ${err.message}`;
  } finally {
    sendBtn.disabled = false;
    sendBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="22" y1="2" x2="11" y2="13"/>
        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg> Send Message`;
    checkStatus();
  }
});

function copyText(elementId) {
  const text = document.getElementById(elementId).textContent;
  navigator.clipboard.writeText(text).then(() => {
    alert('Copied to clipboard: ' + text);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initial Call & Polling interval
checkStatus();
setInterval(checkStatus, 2500);
