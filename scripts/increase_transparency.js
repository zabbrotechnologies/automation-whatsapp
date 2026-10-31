const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '..', 'public', 'style.css');
let css = fs.readFileSync(cssPath, 'utf8');

const targetNavRegex = /\/\* Apple White Translucent Frosted Glass Navbar \*\/[\s\S]*?@media \(prefers-color-scheme: dark\)\s*\{[\s\S]*?\}\s*\}/;

const highTranslucencyNav = `/* Apple Ultra-Frosted Translucent Glass Navbar */
.top-nav,
.translucent-glass {
  width: 100%;
  max-width: 1140px;
  height: 58px;
  background: rgba(255, 255, 255, 0.38) !important;
  backdrop-filter: blur(18px) saturate(200%) !important;
  -webkit-backdrop-filter: blur(18px) saturate(200%) !important;
  border: 1px solid rgba(255, 255, 255, 0.65) !important;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px 0 18px;
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.08), inset 0 1.5px 0 0 rgba(255, 255, 255, 0.9) !important;
}

@media (prefers-color-scheme: dark) {
  .top-nav,
  .translucent-glass {
    background: rgba(255, 255, 255, 0.42) !important;
    border-color: rgba(255, 255, 255, 0.65) !important;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.1), inset 0 1.5px 0 0 rgba(255, 255, 255, 0.9) !important;
  }
}`;

if (targetNavRegex.test(css)) {
  css = css.replace(targetNavRegex, highTranslucencyNav);
} else {
  console.error('targetNavRegex did not match');
}

// Ensure nav links have high contrast over high translucency
css = css.replace(
  /\.nav-link\s*\{[\s\S]*?transition:\s*color 0\.15s ease;\s*\}/,
  `.nav-link {
  text-decoration: none;
  font-size: 13.5px;
  font-weight: 600;
  color: #18181b;
  transition: color 0.15s ease;
}`
);

fs.writeFileSync(cssPath, css, 'utf8');

// Cache bust to v=apple4.0
const htmlFiles = ['index.html', 'dashboard.html', 'login.html', 'admin.html'];
const publicDir = path.join(__dirname, '..', 'public');
htmlFiles.forEach(file => {
  const filePath = path.join(publicDir, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/href=["']style\.css(\?[^"']*)?["']/g, 'href="style.css?v=apple4.0"');
    fs.writeFileSync(filePath, content, 'utf8');
  }
});

console.log('✓ Increased transparency to rgba(255,255,255,0.38) and blur(18px) saturate(200%)');
