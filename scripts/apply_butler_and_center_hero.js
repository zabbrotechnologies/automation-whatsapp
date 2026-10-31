const fs = require('fs');
const path = require('path');

// 1. UPDATE public/index.html to remove arbitrary <br> and add Butler font link
const indexPath = path.join(__dirname, '..', 'public', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// Add Butler CDN link to head if not present
if (!html.includes('cdnfonts.com/css/butler')) {
  html = html.replace(
    '<link rel="stylesheet" href="style.css',
    '<link href="https://fonts.cdnfonts.com/css/butler" rel="stylesheet">\n  <link rel="stylesheet" href="style.css'
  );
}

// Center headline without awkward break
html = html.replace(
  /WhatsApp communication, engineered<br>\s*for enterprise precision\./,
  'WhatsApp communication, engineered for enterprise precision.'
);

fs.writeFileSync(indexPath, html, 'utf8');
console.log('✓ index.html updated');

// 2. UPDATE public/dashboard.html, login.html, admin.html to add Butler link
['dashboard.html', 'login.html', 'admin.html'].forEach(f => {
  const p = path.join(__dirname, '..', 'public', f);
  if (fs.existsSync(p)) {
    let h = fs.readFileSync(p, 'utf8');
    if (!h.includes('cdnfonts.com/css/butler')) {
      h = h.replace(
        '<link rel="stylesheet" href="style.css',
        '<link href="https://fonts.cdnfonts.com/css/butler" rel="stylesheet">\n  <link rel="stylesheet" href="style.css'
      );
      fs.writeFileSync(p, h, 'utf8');
      console.log('✓ ' + f + ' added Butler link');
    }
  }
});

// 3. UPDATE public/style.css
const cssPath = path.join(__dirname, '..', 'public', 'style.css');
let css = fs.readFileSync(cssPath, 'utf8');

// Add @import at top of style.css
if (!css.includes('cdnfonts.com/css/butler')) {
  css = `@import url('https://fonts.cdnfonts.com/css/butler');\n` + css;
}

// Update font variables to Butler
css = css.replace(
  /--font-sans:[^;]+;/,
  `--font-serif: 'Butler', 'Playfair Display', Georgia, serif;\n  --font-sans: 'Butler', -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif;`
);

css = css.replace(
  /--font-body:[^;]+;/,
  `--font-body: 'Butler', -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif;`
);

// Apply Butler to all headings and brand
const butlerRules = `
/* ==========================================================
   BUTLER TYPOGRAPHY IN EVERY ASPECT
   ========================================================== */
h1, h2, h3, h4, h5, h6,
.hero-main-heading,
.section-heading,
.card-title,
.brand-text,
.dash-title-group h1,
.admin-title-group h1,
.footer-brand-title,
.auth-brand-name {
  font-family: 'Butler', Georgia, serif !important;
  letter-spacing: -0.015em;
}
`;

if (!css.includes('BUTLER TYPOGRAPHY IN EVERY ASPECT')) {
  css = css.replace('/* Typography refinement for UI labels, navigation, and controls */', butlerRules + '\n/* Typography refinement for UI labels, navigation, and controls */');
}

// Center the hero section vertically and horizontally with balanced height
const oldHeroRegex = /\.hero-section\s*\{[\s\S]*?min-height:\s*520px;\s*\}/;
const centralizedHero = `.hero-section {
  position: relative;
  z-index: 1;
  padding: 130px 20px 90px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  width: 100%;
  margin-top: -72px; /* Pull under top nav for seamless sky bleed */
  min-height: calc(100vh - 30px); /* Optically centralized hero presence */
  box-sizing: border-box;
}`;

if (oldHeroRegex.test(css)) {
  css = css.replace(oldHeroRegex, centralizedHero);
}

// Refine hero headline sizing & centering for Butler font
css = css.replace(
  /\.hero-main-heading\s*\{[\s\S]*?max-width:\s*900px;\s*\}/,
  `.hero-main-heading {
  font-family: 'Butler', Georgia, serif !important;
  font-size: 64px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-dark);
  line-height: 1.15;
  margin: 0 auto 22px;
  max-width: 940px;
  text-align: center;
}`
);

// Refine hero description with Butler
css = css.replace(
  /\.hero-description\s*\{[\s\S]*?margin-bottom:\s*30px;\s*\}/,
  `.hero-description {
  font-family: 'Butler', Georgia, serif !important;
  font-size: 19px;
  color: var(--text-muted);
  font-weight: 400;
  line-height: 1.65;
  max-width: 700px;
  margin: 0 auto 34px;
  text-align: center;
}`
);

// Cache bust stylesheet link to v=butler1.0
fs.writeFileSync(cssPath, css, 'utf8');

const htmlFiles = ['index.html', 'dashboard.html', 'login.html', 'admin.html'];
const publicDir = path.join(__dirname, '..', 'public');
htmlFiles.forEach(file => {
  const filePath = path.join(publicDir, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/href=["']style\.css(\?[^"']*)?["']/g, 'href="style.css?v=butler1.0"');
    fs.writeFileSync(filePath, content, 'utf8');
  }
});

console.log('✓ Butler typography applied and hero contents centralized successfully!');
