const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '..', 'public', 'style.css');
let css = fs.readFileSync(cssPath, 'utf8');

const targetStr = `.top-nav,
.translucent-glass {
  width: 100%;
  max-width: 1140px;
  height: 58px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px 0 18px;
  box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.85);
}

/* Apple Frosted Glass - Dark Mode */
@media (prefers-color-scheme: dark) {
  .top-nav,
  .translucent-glass {
    background: rgba(20, 20, 20, 0.85);
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15);
  }
}

[data-theme="dark"] .top-nav,
[data-theme="dark"] .translucent-glass,
.dark .top-nav,
.dark .translucent-glass {
  background: rgba(20, 20, 20, 0.85);
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15);
}`;

const replacementStr = `.top-nav,
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

// Normalize line breaks for matching
const normCss = css.replace(/\r\n/g, '\n');
const normTarget = targetStr.replace(/\r\n/g, '\n');
const normReplacement = replacementStr.replace(/\r\n/g, '\n');

if (normCss.includes(normTarget)) {
  const result = normCss.replace(normTarget, normReplacement);
  // Keep original CRLF
  fs.writeFileSync(cssPath, result.replace(/\n/g, '\r\n'), 'utf8');
  console.log('✓ Successfully set navbar background to pure #ffffff without dark-mode darkening');
} else {
  console.error('Target string not found in style.css');
}
