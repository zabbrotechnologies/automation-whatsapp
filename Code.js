/**
 * WhatsApp Automation for Google Sheets
 * 
 * Supports two modes:
 * 1. RENDER_GATEWAY (Recommended for Client):
 *    - 100% Free, NO Account Deletion (Linked Devices QR Code Scan)
 *    - Connects to your Render.com Web App Gateway
 *    - Unlimited free text messages without template approvals
 * 
 * 2. META_CLOUD_API:
 *    - Direct Meta Graph API (requires template approval)
 */

const CONFIG = {
  SHEET_NAME: 'Contacts',
  SETTINGS_SHEET_NAME: 'Settings',
  COLUMNS: {
    NAME: 1,           // Column A: Recipient Name
    PHONE: 2,          // Column B: Phone Number (e.g., 919876543210)
    PARAM_1: 3,        // Column C: Variable 1 (e.g. Order # / Date)
    PARAM_2: 4,        // Column D: Variable 2 (e.g. Amount / Service)
    STATUS: 5,         // Column E: Status (PENDING, SENT, FAILED)
    MESSAGE_ID: 6,     // Column F: WhatsApp Message ID
    SENT_AT: 7,        // Column G: Timestamp when sent
    ERROR_DETAILS: 8   // Column H: Error message if failed
  }
};

/**
 * Custom Menu in Google Sheets
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('💬 WhatsApp Automation')
    .addItem('🚀 Send Pending Messages', 'processPendingMessages')
    .addSeparator()
    .addItem('🧪 Test Connection & Send Sample', 'testConnection')
    .addItem('⚙️ Initialize / Reset Sheet Structure', 'initializeSheets')
    .addItem('🔄 Reset Selected Rows to PENDING', 'resetSelectedRowsToPending')
    .addSeparator()
    .addItem('⏰ Setup Automatic 5-Min Trigger', 'setupTimeTrigger')
    .addItem('🏓 Setup Render Keep-Alive Ping (Prevent Sleep)', 'setupKeepAlivePing')
    .addToUi();
}

/**
 * Retrieves settings from the 'Settings' tab
 */
function getSettings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let settingsSheet = ss.getSheetByName(CONFIG.SETTINGS_SHEET_NAME);
  
  const settings = {
    mode: 'RENDER_GATEWAY', // 'RENDER_GATEWAY' or 'META_CLOUD_API'
    gatewayUrl: 'https://YOUR_APP_NAME.onrender.com',
    apiSecret: 'secret123',
    messageTemplate: 'Hello {name}! Your update for {param1} is ready. {param2}',
    metaPhoneId: '',
    metaToken: '',
    metaTemplateName: 'hello_world'
  };

  if (settingsSheet) {
    const data = settingsSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const key = String(data[i][0]).trim();
      const val = String(data[i][1]).trim();
      if (key === 'Active Mode (RENDER_GATEWAY or META_CLOUD_API)') settings.mode = val.toUpperCase() || 'RENDER_GATEWAY';
      if (key === 'Render Gateway Web URL') settings.gatewayUrl = val.replace(/\/+$/, '');
      if (key === 'Gateway API Secret Key') settings.apiSecret = val;
      if (key === 'Message Format / Text') settings.messageTemplate = val;
      if (key === 'Meta Phone Number ID') settings.metaPhoneId = val;
      if (key === 'Meta Permanent Token') settings.metaToken = val;
      if (key === 'Meta Template Name') settings.metaTemplateName = val;
    }
  }

  return settings;
}

/**
 * Normalizes phone numbers (removes '+', spaces, dashes, parentheses)
 */
function cleanPhoneNumber(phone) {
  if (!phone) return null;
  let phoneStr = String(phone).trim().replace(/\D/g, '');
  if (phoneStr.length < 7 || phoneStr.length > 15) return null;
  return phoneStr;
}

/**
 * Main function: Processes all rows with Status = 'PENDING'
 */
function processPendingMessages() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  
  if (!sheet) {
    SpreadsheetApp.getUi().alert(`Sheet "${CONFIG.SHEET_NAME}" not found. Please click "Initialize Sheet Structure".`);
    return;
  }

  const settings = getSettings();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('No data rows found in sheet.');
    return;
  }

  const dataRange = sheet.getRange(2, 1, lastRow - 1, 8);
  const rows = dataRange.getValues();

  let sentCount = 0;
  let failCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowIndex = i + 2;
    const status = String(row[CONFIG.COLUMNS.STATUS - 1]).trim().toUpperCase();

    if (status === 'PENDING') {
      const recipientName = String(row[CONFIG.COLUMNS.NAME - 1] || '').trim();
      const rawPhone = row[CONFIG.COLUMNS.PHONE - 1];
      const param1 = String(row[CONFIG.COLUMNS.PARAM_1 - 1] || '').trim();
      const param2 = String(row[CONFIG.COLUMNS.PARAM_2 - 1] || '').trim();

      const phone = cleanPhoneNumber(rawPhone);
      if (!phone) {
        sheet.getRange(rowIndex, CONFIG.COLUMNS.STATUS).setValue('FAILED');
        sheet.getRange(rowIndex, CONFIG.COLUMNS.ERROR_DETAILS).setValue('Invalid phone number. Ensure country code is included (e.g. 919876543210).');
        failCount++;
        continue;
      }

      // Mark as PROCESSING to avoid race conditions
      sheet.getRange(rowIndex, CONFIG.COLUMNS.STATUS).setValue('PROCESSING');
      SpreadsheetApp.flush();

      // Format custom message text
      const messageBody = settings.messageTemplate
        .replace(/\{name\}/gi, recipientName)
        .replace(/\{param1\}/gi, param1)
        .replace(/\{param2\}/gi, param2);

      let result;
      if (settings.mode === 'RENDER_GATEWAY') {
        result = sendViaRenderGateway(phone, messageBody, settings);
      } else {
        result = sendViaMetaCloud(phone, { name: recipientName, param1, param2 }, settings);
      }

      if (result.success) {
        sheet.getRange(rowIndex, CONFIG.COLUMNS.STATUS).setValue('SENT');
        sheet.getRange(rowIndex, CONFIG.COLUMNS.MESSAGE_ID).setValue(result.messageId || 'SENT');
        sheet.getRange(rowIndex, CONFIG.COLUMNS.SENT_AT).setValue(new Date());
        sheet.getRange(rowIndex, CONFIG.COLUMNS.ERROR_DETAILS).setValue('');
        sentCount++;
      } else {
        sheet.getRange(rowIndex, CONFIG.COLUMNS.STATUS).setValue('FAILED');
        sheet.getRange(rowIndex, CONFIG.COLUMNS.ERROR_DETAILS).setValue(result.error);
        failCount++;
      }

      // 400ms delay to keep sending smooth
      Utilities.sleep(400);
    }
  }

  Logger.log(`Finished processing: ${sentCount} sent, ${failCount} failed.`);
  return { sentCount, failCount };
}

/**
 * Sends message through your Render.com WhatsApp Gateway (Linked Devices - No Account Deletion)
 */
function sendViaRenderGateway(phone, messageText, settings) {
  const url = `${settings.gatewayUrl}/api/send`;

  const payload = {
    phone: phone,
    message: messageText
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': settings.apiSecret
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    const body = JSON.parse(response.getContentText());

    if (code >= 200 && code < 300 && body.success) {
      return { success: true, messageId: body.messageId };
    } else {
      return { success: false, error: body.error || `[HTTP ${code}] ${response.getContentText()}` };
    }
  } catch (err) {
    return { success: false, error: `Connection failed: ${err.message}. Is your Render Web App running?` };
  }
}

/**
 * Sends message through official Meta WhatsApp Cloud API (Alternative mode)
 */
function sendViaMetaCloud(phone, params, settings) {
  const url = `https://graph.facebook.com/v21.0/${settings.metaPhoneId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: settings.metaTemplateName,
      language: { code: 'en_US' }
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': `Bearer ${settings.metaToken}` },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    const body = JSON.parse(response.getContentText());

    if (code >= 200 && code < 300) {
      return { success: true, messageId: body.messages?.[0]?.id };
    } else {
      return { success: false, error: body.error?.message || response.getContentText() };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Test Connection Dialog
 */
function testConnection() {
  const ui = SpreadsheetApp.getUi();
  const settings = getSettings();

  const prompt = ui.prompt(
    '🧪 Test WhatsApp Connection',
    `Active Mode: ${settings.mode}\n\nEnter recipient phone number with country code (e.g. 919876543210):`,
    ui.ButtonSet.OK_CANCEL
  );

  if (prompt.getSelectedButton() !== ui.Button.OK) return;

  const phone = cleanPhoneNumber(prompt.getResponseText());
  if (!phone) {
    ui.alert('Invalid phone number. Please enter digits with country code.');
    return;
  }

  let result;
  if (settings.mode === 'RENDER_GATEWAY') {
    result = sendViaRenderGateway(phone, 'Hello! This is a test message from your Google Sheets WhatsApp Gateway.', settings);
  } else {
    result = sendViaMetaCloud(phone, { name: 'Tester', param1: '', param2: '' }, settings);
  }

  if (result.success) {
    ui.alert('✅ Success!', `Message sent successfully!\nMessage ID: ${result.messageId}\nCheck WhatsApp!`, ui.ButtonSet.OK);
  } else {
    ui.alert('❌ Test Failed', `Could not send message:\n\n${result.error}`, ui.ButtonSet.OK);
  }
}

/**
 * Creates and formats Contacts and Settings sheets
 */
function initializeSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Contacts Sheet
  let contactsSheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!contactsSheet) contactsSheet = ss.insertSheet(CONFIG.SHEET_NAME);

  const headers = [
    'Recipient Name',
    'Phone Number (with Country Code)',
    'Param 1 (e.g. Order #)',
    'Param 2 (e.g. Amount)',
    'Status',
    'WhatsApp Message ID',
    'Sent At',
    'Error Details'
  ];

  contactsSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  contactsSheet.getRange(1, 1, 1, headers.length)
    .setBackground('#00A884')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');
  contactsSheet.setFrozenRows(1);

  if (contactsSheet.getLastRow() === 1) {
    contactsSheet.appendRow(['Alex', '919876543210', 'ORD-101', '₹499', 'PENDING', '', '', '']);
  }

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['PENDING', 'SENT', 'FAILED', 'PROCESSING'], true)
    .setAllowInvalid(true)
    .build();
  contactsSheet.getRange(2, CONFIG.COLUMNS.STATUS, 500, 1).setDataValidation(statusRule);

  // 2. Settings Sheet
  let settingsSheet = ss.getSheetByName(CONFIG.SETTINGS_SHEET_NAME);
  if (!settingsSheet) settingsSheet = ss.insertSheet(CONFIG.SETTINGS_SHEET_NAME);

  const settingsData = [
    ['Setting Name', 'Value', 'Instructions / Description'],
    ['Active Mode (RENDER_GATEWAY or META_CLOUD_API)', 'RENDER_GATEWAY', 'Use RENDER_GATEWAY for 100% free with no account deletion'],
    ['Render Gateway Web URL', 'https://your-app-name.onrender.com', 'Your Render.com Web App URL (do not end with slash)'],
    ['Gateway API Secret Key', 'secret123', 'Must match the API_SECRET in Render Environment Variables'],
    ['Message Format / Text', 'Hello {name}! Your order {param1} is confirmed. Amount: {param2}. Thank you!', 'Custom message. Supports {name}, {param1}, {param2}'],
    ['Meta Phone Number ID', '', 'Only needed if using META_CLOUD_API mode'],
    ['Meta Permanent Token', '', 'Only needed if using META_CLOUD_API mode'],
    ['Meta Template Name', 'hello_world', 'Only needed if using META_CLOUD_API mode']
  ];

  settingsSheet.getRange(1, 1, settingsData.length, 3).setValues(settingsData);
  settingsSheet.getRange(1, 1, 1, 3)
    .setBackground('#111B21')
    .setFontColor('#00A884')
    .setFontWeight('bold');

  settingsSheet.autoResizeColumns(1, 3);
  contactsSheet.autoResizeColumns(1, headers.length);

  SpreadsheetApp.getUi().alert('✅ Initialization Complete!\n\n1. In the "Settings" tab, enter your Render Gateway Web URL.\n2. In "Contacts", set row Status to PENDING.\n3. Click WhatsApp Automation > Send Pending Messages.');
}

/**
 * Resets selected rows back to PENDING
 */
function resetSelectedRowsToPending() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return;

  const range = sheet.getActiveRange();
  const startRow = Math.max(2, range.getRow());
  const numRows = range.getNumRows();

  for (let r = 0; r < numRows; r++) {
    const currentRow = startRow + r;
    sheet.getRange(currentRow, CONFIG.COLUMNS.STATUS).setValue('PENDING');
    sheet.getRange(currentRow, CONFIG.COLUMNS.ERROR_DETAILS).setValue('');
  }

  SpreadsheetApp.getUi().alert('Selected rows reset to PENDING.');
}

/**
 * Setup automatic trigger to check sheet every 5 minutes
 */
function setupTimeTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'processPendingMessages') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('processPendingMessages').timeBased().everyMinutes(5).create();
  SpreadsheetApp.getUi().alert('✅ Automatic Trigger Set!\n\nGoogle Sheets will check for rows with Status "PENDING" every 5 minutes.');
}

/**
 * Keeps Render.com free server awake by pinging /health every 10 minutes
 */
function pingRenderServer() {
  const settings = getSettings();
  if (settings.mode === 'RENDER_GATEWAY' && settings.gatewayUrl && !settings.gatewayUrl.includes('YOUR_APP_NAME')) {
    try {
      UrlFetchApp.fetch(`${settings.gatewayUrl}/health`, { muteHttpExceptions: true });
      Logger.log('Pinged Render successfully.');
    } catch (e) {
      Logger.log('Ping failed: ' + e.message);
    }
  }
}

function setupKeepAlivePing() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'pingRenderServer') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('pingRenderServer').timeBased().everyMinutes(10).create();
  SpreadsheetApp.getUi().alert('✅ Keep-Alive Ping Set!\n\nGoogle Sheets will ping your Render server every 10 minutes to prevent it from going to sleep.');
}
