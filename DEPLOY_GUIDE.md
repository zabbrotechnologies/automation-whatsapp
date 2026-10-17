# 🚀 Render.com-ல் 100% Free-ஆக Deploy செய்வது எப்படி? (No Credit Card)

இந்த வழிகாட்டி மூலம் 5 நிமிடங்களில் உங்களால் இந்த WhatsApp Web Dashboard-ஐ Render.com-ல் இலவசமாக Deploy செய்ய முடியும்.

---

## Step 1: இந்த Code-ஐ GitHub-ல் Push செய்தல்
1. உங்கள் கணினியில் Git Bash அல்லது Terminal திறந்து இந்த Project Folder-ல் பின்வரும் கட்டளைகளை இயக்கவும்:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for WhatsApp Gateway"
   ```
2. [github.com](https://github.com)-க்குச் சென்று **New Repository** ஒன்றை உருவாக்கவும் (உதாரணமாக: `whatsapp-sheets-gateway`).
3. GitHub-ல் காட்டும் Command-களை இயக்கி Push செய்யவும்:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/whatsapp-sheets-gateway.git
   git branch -M main
   git push -u origin main
   ```

---

## Step 2: Render.com-ல் Free Web Service தொடங்குதல்
1. [render.com](https://render.com)-க்குச் சென்று **Sign Up** கிளிக் செய்யவும்.
2. **GitHub** அல்லது **Google** மூலம் Login செய்யவும் (Credit Card கேட்காது).
3. Dashboard-ல் மேலே உள்ள **+ New** பட்டனைக் கிளிக் செய்து **Web Service** என்பதைத் தேர்ந்தெடுக்கவும்.
4. **Build and deploy from a Git repository** என்பதைத் தேர்வு செய்து, நீங்கள் இப்போது உருவாக்கிய GitHub Repository-ஐ Connect செய்யவும்.
5. பின்வரும் விவரங்களை உள்ளிடவும்:
   - **Name**: `my-whatsapp-gateway` (அல்லது நீங்கள் விரும்பும் பெயர்)
   - **Region**: `Singapore` (இந்தியாவுக்கு மிக அருகில் உள்ளதால் மிக வேகமாக இருக்கும்)
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: **Free** ($0/month)
6. கீழே **Environment Variables**-ல்:
   - Key: `API_SECRET` | Value: `secret123` (அல்லது உங்கள் ரகசிய password)
7. **Deploy Web Service** பட்டனை கிளிக் செய்யவும்!

---

## Step 3: QR Code Scan செய்தல் (Linked Devices)
1. Deploy முடிந்ததும், Render திரையின் மேலே ஒரு URL கிடைக்கும் (எ.கா: `https://my-whatsapp-gateway.onrender.com`).
2. அந்த Website URL-ஐ Browser-ல் திறக்கவும்.
3. இப்போது அழகான **WhatsApp Gateway Dashboard** திரையில் தோன்றும்:
   - திரையில் **Live QR Code** உருவாகும்.
4. Client-ன் மொபைலில்:
   - **WhatsApp > Settings > Linked Devices > Link a device** கொடுத்து இந்த QR Code-ஐ Scan செய்யவும்.
5. Scan செய்த அடுத்த நொடி, திரை **🟢 Connected (+91 98765 43210)** என்று மாறிவிடும்!
   - மொபைல் WhatsApp எப்போதும் போல இயங்கும் (Delete ஆகாது).
   - Test Message பகுதியில் ஏதேனும் ஒரு மொபைல் எண்ணை உள்ளிட்டு Send செய்து சரிபார்க்கலாம்.

---

## Step 4: Google Sheet-உடன் இணைத்தல்
1. உங்கள் Google Sheet-ஐ திறக்கவும்.
2. **Extensions > Apps Script**-க்கு சென்று, அங்குள்ள பழைய code-ஐ நீக்கிவிட்டு, நமது புதுப்பிக்கப்பட்ட [`Code.js`](file:///d:/Documents/projects/automation-for-whatsapp/Code.js)-ஐ Paste செய்து Save செய்யவும்.
3. Google Sheet-க்கு திரும்பி வந்து, **💬 WhatsApp Automation** > **⚙️ Initialize / Reset Sheet Structure** கிளிக் செய்யவும்.
4. இப்போது உருவான **`Settings`** tab-ல்:
   - **Render Gateway Web URL**: உங்கள் Render Web App URL (எ.கா: `https://my-whatsapp-gateway.onrender.com`).
   - **Gateway API Secret Key**: `secret123`.
   - **Message Format**: உங்களுக்கு தேவையான மெசேஜ் வடிவம் (எ.கா: `வணக்கம் {name}! உங்கள் பதிவு {param1} உறுதியானது.`).
5. **Render Server தூங்காமல் இருக்க (Prevent Sleep)**:
   - Google Sheet Menu-வில்: **💬 WhatsApp Automation** > **🏓 Setup Render Keep-Alive Ping**-ஐ கிளிக் செய்துவிட்டால், Google Apps Script தானாகவே ஒவ்வொரு 10 நிமிடங்களுக்கும் Render-க்கு ஒரு Ping அனுப்பி அதை 24 மணி நேரமும் Active-ஆக வைத்திருக்கும்!

---

## Step 5: மெசேஜ் அனுப்புதல்
1. **`Contacts`** tab-ல் வாடிக்கையாளர்களின் எண்கள், பெயர்கள் மற்றும் விவரங்களை உள்ளிடவும்.
2. **Status**-ஐ `PENDING` என்று வைக்கவும்.
3. **💬 WhatsApp Automation** > **🚀 Send Pending Messages** கிளிக் செய்தால் போதும் — அனைத்து வாடிக்கையாளர்களுக்கும் நொடிகளில் WhatsApp மெசேஜ் சென்றுவிடும்!
