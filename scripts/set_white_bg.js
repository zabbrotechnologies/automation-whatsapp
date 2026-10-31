const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '..', 'public', 'style.css');
let css = fs.readFileSync(cssPath, 'utf8');

// 1. Change --bg-page to pure white #ffffff
css = css.replace(/--bg-page:\s*#fbfbf9;/, '--bg-page: #ffffff;');

// 2. Remove hero sky background and set hero to pure white
const heroSectionRegex = /\.hero-section\s*\{[\s\S]*?min-height:\s*520px;[\s\S]*?\}/;
const newHeroSection = `.hero-section {
  position: relative;
  z-index: 1;
  padding: 100px 20px 80px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: 100%;
  margin-top: -72px;
  min-height: 520px;
  background: #ffffff;
}`;

if (heroSectionRegex.test(css)) {
  css = css.replace(heroSectionRegex, newHeroSection);
}

// 3. Disable hero-parallax-bg and hero-sky-overlay
css = css.replace(
  /\.hero-parallax-bg\s*\{[\s\S]*?transition:\s*transform[^;]+;[\s\S]*?\}/,
  `.hero-parallax-bg {
  display: none;
}`
);

css = css.replace(
  /\.hero-sky-overlay\s*\{[\s\S]*?pointer-events:\s*none;[\s\S]*?\}/,
  `.hero-sky-overlay {
  display: none;
}`
);

fs.writeFileSync(cssPath, css, 'utf8');
console.log('✓ Successfully set background to pure white #ffffff');
