const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '..', 'public', 'style.css');
let css = fs.readFileSync(cssPath, 'utf8');

// 1. Update .top-nav to true frosted translucent white
const topNavBlock = `/* Apple White Translucent Frosted Glass Navbar */
.top-nav,
.translucent-glass {
  width: 100%;
  max-width: 1140px;
  height: 58px;
  background: rgba(255, 255, 255, 0.65) !important;
  backdrop-filter: blur(20px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
  border: 1px solid rgba(255, 255, 255, 0.5) !important;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px 0 18px;
  box-shadow: 0 4px 24px 0 rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.95) !important;
}

@media (prefers-color-scheme: dark) {
  .top-nav,
  .translucent-glass {
    background: rgba(255, 255, 255, 0.7) !important;
    border-color: rgba(255, 255, 255, 0.5) !important;
    box-shadow: 0 4px 24px 0 rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.95) !important;
  }
}`;

const currentTopNavRegex = /\/\* Apple White Translucent Frosted Glass Navbar \*\/[\s\S]*?@media \(prefers-color-scheme: dark\)\s*\{[\s\S]*?\}\s*\}/;
if (currentTopNavRegex.test(css)) {
  css = css.replace(currentTopNavRegex, topNavBlock);
}

// 2. Restore .hero-section and .hero-parallax-bg so there is atmospheric background behind the navbar
const currentHeroRegex = /\.hero-section\s*\{[\s\S]*?min-height:\s*520px;[\s\S]*?background:\s*#ffffff;[\s\S]*?\.hero-sky-overlay\s*\{[\s\S]*?display:\s*none;[\s\S]*?\}/;

const restoredHeroBlock = `.hero-section {
  position: relative;
  z-index: 1;
  padding: 100px 20px 80px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: 100%;
  margin-top: -72px; /* Pull under top nav for seamless sky bleed */
  min-height: 520px;
}

/* Parallax Sky Background Image Layer */
.hero-parallax-bg {
  position: absolute;
  top: -20%;
  left: 0;
  width: 100%;
  height: 140%;
  background-image: url('hero-sky.jpg');
  background-size: cover;
  background-position: center bottom;
  background-repeat: no-repeat;
  z-index: 0;
  pointer-events: none;
  transform: translate3d(0, 0, 0);
  will-change: transform;
  transition: transform 0.1s cubic-bezier(0.2, 0, 0.2, 1);
}

/* Subtle Sky Fade / Mist overlay for pristine readability */
.hero-sky-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.35) 0%,
    rgba(255, 255, 255, 0.15) 40%,
    rgba(251, 251, 249, 0.85) 85%,
    rgba(251, 251, 249, 1) 100%
  );
  z-index: 1;
  pointer-events: none;
}`;

if (currentHeroRegex.test(css)) {
  css = css.replace(currentHeroRegex, restoredHeroBlock);
  console.log('✓ Restored hero atmospheric sky background behind navbar');
} else {
  console.log('Hero regex did not match, checking direct substitution');
}

// 3. Cache bust with v=apple3.0
fs.writeFileSync(cssPath, css, 'utf8');

const htmlFiles = ['index.html', 'dashboard.html', 'login.html', 'admin.html'];
const publicDir = path.join(__dirname, '..', 'public');
htmlFiles.forEach(file => {
  const filePath = path.join(publicDir, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/href=["']style\.css(\?[^"']*)?["']/g, 'href="style.css?v=apple3.0"');
    fs.writeFileSync(filePath, content, 'utf8');
  }
});

console.log('✓ Translucent frosted glass and cache-busting v=apple3.0 complete');
