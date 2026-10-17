/**
 * WhatsApp Cloud API Webhook Handler (Optional Real-Time Delivery Receipts)
 * 
 * If you deploy this Apps Script project as a Web App:
 * 1. Deploy > New Deployment > Web App > Execute as: Me, Who has access: Anyone.
 * 2. In Meta App Dashboard > WhatsApp > Configuration > Webhook URL:
 *    Paste the Web App URL and set Verify Token to the one defined below (e.g. "my_secret_token_123").
 * 3. Subscribe to the "messages" field.
 * 
 * Google Sheets will now automatically update message statuses from 'SENT' to 'DELIVERED' or 'READ'!
 */

const WEBHOOK_VERIFY_TOKEN = 'whatsapp_sheets_verify_token_123';

/**
 * Handles Meta Webhook verification handshake (GET request)
 */
function doGet(e) {
  const mode = e.parameter['hub.mode'];
  const token = e.parameter['hub.verify_token'];
  const challenge = e.parameter['hub.challenge'];

  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    return ContentService.createTextOutput(challenge);
  }

  return ContentService.createTextOutput('Verification failed').setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Handles Meta incoming status updates (POST request: sent, delivered, read, failed)
 */
function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);

    if (postData.entry && postData.entry.length > 0) {
      const changes = postData.entry[0].changes;
      if (changes && changes.length > 0) {
        const value = changes[0].value;

        // Check if event is a message status update (sent, delivered, read, failed)
        if (value.statuses && value.statuses.length > 0) {
          const statusObj = value.statuses[0];
          const wamid = statusObj.id;
          const status = statusObj.status.toUpperCase(); // 'DELIVERED', 'READ', 'FAILED'

          updateStatusByMessageId(wamid, status);
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'EVENT_RECEIVED' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('Webhook error: ' + err.toString());
    return ContentService.createTextOutput(JSON.stringify({ status: 'ERROR', error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Finds the row matching the WhatsApp Message ID and updates its status
 */
function updateStatusByMessageId(wamid, newStatus) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const msgIdCol = sheet.getRange(2, CONFIG.COLUMNS.MESSAGE_ID, lastRow - 1, 1).getValues();

  for (let i = 0; i < msgIdCol.length; i++) {
    if (String(msgIdCol[i][0]).trim() === wamid) {
      const rowIndex = i + 2;
      sheet.getRange(rowIndex, CONFIG.COLUMNS.STATUS).setValue(newStatus);
      break;
    }
  }
}
