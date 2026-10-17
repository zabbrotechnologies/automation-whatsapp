# 📲 Automated WhatsApp Messages: Google Sheets ➔ WhatsApp Business Cloud API

A **100% free**, zero-maintenance solution to automatically send WhatsApp messages from **Google Sheets** using **Google Apps Script** and the **Official Meta WhatsApp Business Cloud API**.

---

## 🌟 Key Features
- **Zero Cost**: Built using Google Apps Script (free Google service) and Meta WhatsApp Cloud API (free tier includes 1,000 service conversations per month).
- **Automatic Status Detection**: Automatically finds rows where `Status = "PENDING"`, formats phone numbers, and sends WhatsApp messages.
- **Real-Time Sheet Updates**: Automatically logs `SENT`, `FAILED`, Meta `Message ID` (`wamid`), and error diagnostics back into Google Sheets.
- **Custom WhatsApp Menu**: Integrated directly into Google Sheets UI:
  - 🚀 **Send Pending Messages**
  - 🧪 **Test WhatsApp API Connection**
  - ⚙️ **Initialize / Reset Sheet Structure**
  - 🔄 **Reset Selected Rows to PENDING**
  - ⏰ **Setup Automatic Trigger (Every 5 mins)**
- **Meta Templates & Variables Support**: Supports Meta approved templates with dynamic variables (`{{1}}`, `{{2}}`).
- **Optional Webhook (Delivery Receipts)**: Supports two-way status updates (`DELIVERED`, `READ`).

---

## 📋 Architecture & Data Flow

```text
┌─────────────────┐       ┌──────────────────────┐       ┌────────────────────────┐
│  Google Sheets  │ ----> │  Google Apps Script  │ ----> │ Meta WhatsApp Cloud API│
│ (Contacts Sheet)│       │      (Code.js)       │       │    (Graph API v21.0)   │
└─────────────────┘       └──────────────────────┘       └───────────┬────────────┘
         ▲                           │                               │
         │                           ▼                               ▼
         │                 Updates Status, Msg ID,           Delivers Message
         └───────────────  Timestamp & Error Logs            to Recipient Phone
```

---

## 🚀 Quick Setup Guide (Step-by-Step)

### Step 1: Get Free Meta WhatsApp Cloud API Credentials
1. Go to the [Meta for Developers Portal](https://developers.facebook.com/) and log in with your Facebook account.
2. Click **My Apps** > **Create App**.
3. Select **Other** as the use case > click **Next**.
4. Choose **Business** as the app type > click **Next**.
5. Give your app a name (e.g. `Sheets-WhatsApp-Automation`) and click **Create app**.
6. On the App Dashboard, scroll to **WhatsApp** and click **Set up**.
7. In the left navigation, open **WhatsApp** > **API Setup**:
   - Note down your **Phone Number ID** (e.g. `1048291829...`).
   - Copy the **Temporary Access Token** (valid for 24 hours for quick testing).
   - Under *To*, add your personal WhatsApp number as a test recipient to receive the verification code.

*(Tip: For production, create a permanent System User Token under Meta Business Settings > Users > System Users with `whatsapp_business_messaging` permission).*

---

### Step 2: Set Up Google Sheets & Apps Script
1. Create a new Google Sheet at [sheets.new](https://sheets.new).
2. In the top menu, click **Extensions** > **Apps Script**.
3. In the Apps Script code editor:
   - Delete any default text in `Code.gs`.
   - Copy and paste the entire code from [`Code.js`](file:///d:/Documents/projects/automation-for-whatsapp/Code.js).
   - (Optional) Click the **+** icon > **Script**, name it `Webhook`, and paste [`Webhook.js`](file:///d:/Documents/projects/automation-for-whatsapp/Webhook.js).
4. Click the **Save** icon (💾) or press `Ctrl + S`.
5. Name your Apps Script project (e.g., `WhatsApp Automation`).

---

### Step 3: Initialize the Sheet
1. Refresh your Google Sheet tab in your browser.
2. A new menu item named **💬 WhatsApp Automation** will appear in the Google Sheets toolbar.
3. Click **💬 WhatsApp Automation** > **⚙️ Initialize / Reset Sheet Structure**.
4. Google will ask for authorization on the first run:
   - Click **Review permissions** > Choose your Google Account.
   - Click **Advanced** > Click **Go to WhatsApp Automation (unsafe)** > Click **Allow**.
5. Once executed, two tabs will automatically be created and styled:
   - **`Contacts`**: Contains recipient data, phone numbers, parameters, and status tracking.
   - **`Settings`**: Contains your API configuration.

---

### Step 4: Configure Credentials
1. Switch to the **`Settings`** tab in your Google Sheet.
2. Paste your **Phone Number ID** into row 2.
3. Paste your **Access Token** into row 3.
4. Leave `Template Name` as `hello_world` for your first test.

---

### Step 5: Test Your Setup
1. In the top menu, click **💬 WhatsApp Automation** > **🧪 Test WhatsApp API Connection**.
2. Enter your WhatsApp number with country code (e.g., `15551234567` or `919876543210`).
3. You should instantly receive Meta's default `hello_world` message on your phone!

---

### Step 6: Send Automated Messages from the Sheet
1. Open the **`Contacts`** tab.
2. Add your contact rows:
   - **Name**: Recipient's name.
   - **Phone Number**: Number with country code (e.g., `15551234567`, `919876543210`).
   - **Param 1 & Param 2**: Dynamic values for your template (e.g., Name, Order Number, Meeting Time).
   - **Status**: Set to `PENDING`.
3. Click **💬 WhatsApp Automation** > **🚀 Send Pending Messages**.
4. The script will process each pending row, send the WhatsApp message, and update:
   - `Status`: `SENT`
   - `WhatsApp Message ID`: `wamid.HBg...`
   - `Sent At`: Timestamp
   - `Error Details`: (empty if successful, or error explanation if failed)

---

## ⏰ Enabling Hands-Free Automation

### Option A: Automatic Scheduled Runs (Recommended)
Click **💬 WhatsApp Automation** > **⏰ Setup Automatic Trigger (Every 5 mins)**.
- Apps Script will automatically check the sheet every 5 minutes and send any rows marked `PENDING`.

### Option B: Trigger on Edit
Whenever you type `PENDING` into the `Status` column, the script can trigger immediately using an installable `onEdit` trigger:
1. In Apps Script, click the **Triggers (⏰ clock icon)** on the left sidebar.
2. Click **Add Trigger** (bottom right).
3. Set:
   - Choose which function to run: `onEditTrigger`
   - Select event source: `From spreadsheet`
   - Select event type: `On edit`
4. Click **Save**.

---

## 🏷️ Custom Templates & Dynamic Variables

Meta requires template messages for business-initiated chats. To create your own:
1. In Meta Business Manager, go to **WhatsApp Manager** > **Message Templates**.
2. Click **Create Template** (e.g., Category: *Utility* or *Marketing*).
3. Example Body:
   > *"Hi {{1}}, your appointment is confirmed for {{2}}. Reply STOP to unsubscribe."*
4. Submit for review (approval usually takes 1-5 minutes).
5. Once approved:
   - In your Google Sheet **`Settings`** tab, change `Template Name` to your new template's name.
   - Put `{{1}}` value into **Param 1** (Column C) and `{{2}}` value into **Param 2** (Column D).

---

## 💡 Troubleshooting & Common Issues

| Error Message | Cause & Fix |
| :--- | :--- |
| **`(#131030) Recipient phone number not in allowed list`** | You are using a Meta Test Phone Number. You must add the recipient's phone number to the allowed list in Meta App Dashboard > WhatsApp > API Setup > *To* dropdown. |
| **`(#190) Invalid OAuth access token`** | Your temporary token expired (valid 24h). Generate a new one or create a permanent System User Token in Meta Business Settings. |
| **`Template not found`** | Ensure the template name in the `Settings` tab matches the Meta template name in exact lowercase, and that the `Language Code` (e.g., `en_US`) matches the approved language. |
| **`Invalid phone number format`** | Phone number must include the country code without plus sign, spaces, or dashes (the script automatically sanitizes inputs like `+1 (555) 019-2834` to `15550192834`). |
