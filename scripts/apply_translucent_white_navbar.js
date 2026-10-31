const fs = require('fs');
const path = require('path');

// 1. UPDATE public/style.css
const cssPath = path.join(__dirname, '..', 'public', 'style.css');
let css = fs.readFileSync(cssPath, 'utf8');

const targetNav = `.top-nav,
.translucent-glass {
  width: 100%;
  max-width: 1140px;
  height: 58px;
  background: #ffffff;
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px 0 18px;
  box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05), inset 0 1px 0 #ffffff;
}`;

const replacementNav = `/* Apple White Translucent Frosted Glass Navbar */
.top-nav,
.translucent-glass {
  width: 100%;
  max-width: 1140px;
  height: 58px;
  background: rgba(255, 255, 255, 0.82) !important;
  backdrop-filter: blur(24px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
  border: 1px solid rgba(228, 228, 231, 0.85) !important;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px 0 18px;
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.95) !important;
}

/* Explicitly prevent dark-mode from ever darkening the navbar */
@media (prefers-color-scheme: dark) {
  .top-nav,
  .translucent-glass {
    background: rgba(255, 255, 255, 0.85) !important;
    border-color: rgba(228, 228, 231, 0.85) !important;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.95) !important;
  }
}`;

const normCss = css.replace(/\r\n/g, '\n');
const normTarget = targetNav.replace(/\r\n/g, '\n');
const normReplacement = replacementNav.replace(/\r\n/g, '\n');

if (normCss.includes(normTarget)) {
  const result = normCss.replace(normTarget, normReplacement);
  fs.writeFileSync(cssPath, result.replace(/\n/g, '\r\n'), 'utf8');
  console.log('✓ public/style.css updated with white translucent glass');
} else {
  console.error('Target not found in style.css');
}

// 2. CACHE-BUST in all HTML files so browser immediately picks up new style
const htmlFiles = ['index.html', 'dashboard.html', 'login.html', 'admin.html'];
const publicDir = path.join(__dirname, '..', 'public');

htmlFiles.forEach(file => {
  const filePath = path.join(publicDir, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    // Replace href="style.css..." with href="style.css?v=apple2.2"
    content = content.replace(/href=["']style\.css(\?[^"']*)?["']/g, 'href="style.css?v=apple2.2"');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ Cache-busted style.css in public/${file}`);
  }
});
