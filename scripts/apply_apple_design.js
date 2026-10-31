const fs = require('fs');
const path = require('path');

// 1. UPDATE public/style.css
const cssPath = path.join(__dirname, '..', 'public', 'style.css');
let css = fs.readFileSync(cssPath, 'utf8');

// Replace font variables & add easing
css = css.replace(
  /--font-sans:[^;]+;/,
  `--ease-apple: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-apple-press: cubic-bezier(0.2, 0, 0, 1);
  --ease-apple-spring: cubic-bezier(0.175, 0.885, 0.32, 1.15);
  --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "SF Pro", "Inter", -apple-system-subheadline, system-ui, sans-serif;`
);

css = css.replace(
  /--font-body:[^;]+;/,
  `--font-body: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro", "Inter", system-ui, sans-serif;`
);

css = css.replace(
  /--font-mono:[^;]+;/,
  `--font-mono: "SF Mono", "JetBrains Mono", Menlo, Monaco, Consolas, monospace;`
);

// Specular inset highlights in shadows
css = css.replace(
  /--shadow-subtle: 0 1px 3px rgba\(0, 0, 0, 0\.04\);/,
  `--shadow-subtle: 0 1px 3px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.85);`
);

css = css.replace(
  /--shadow-mockup: 0 20px 50px -10px rgba\(0, 0, 0, 0\.08\), 0 8px 24px -6px rgba\(0, 0, 0, 0\.04\);/,
  `--shadow-mockup: 0 20px 50px -10px rgba(0, 0, 0, 0.08), 0 8px 24px -6px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.9);`
);

css = css.replace(
  /--shadow-card: 0 4px 20px -2px rgba\(0, 0, 0, 0\.04\), 0 2px 6px -1px rgba\(0, 0, 0, 0\.02\);/,
  `--shadow-card: 0 4px 20px -2px rgba(0, 0, 0, 0.04), 0 2px 6px -1px rgba(0, 0, 0, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.85);`
);

// Mobile ergonomics & tap highlight & instant press
const mobileTouchRules = `
/* Apple Touch Ergonomics & Active Press Feedback */
button,
.btn,
[role="button"],
a,
input,
select,
textarea {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

button:active,
.btn:active,
.btn-nav-primary:active,
.btn-hero-dark:active,
.btn-hero-light:active,
.btn-tier-dark:active,
.btn-tier-outline:active,
.tab-btn:active,
.faq-summary:active {
  transform: scale(0.975);
  transition: transform 100ms var(--ease-apple-press) !important;
}
`;

if (!css.includes('Apple Touch Ergonomics')) {
  css = css.replace(
    '/* Typography refinement for UI labels, navigation, and controls */',
    mobileTouchRules + '\n/* Typography refinement for UI labels, navigation, and controls */'
  );
}

// Refine navbar blur and saturation
css = css.replace(
  /backdrop-filter: blur\(16px\);\s*-webkit-backdrop-filter: blur\(16px\);/,
  `backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.85);`
);

// Optimize transitions to composite transforms with Apple ease
css = css.replace(
  /\.btn-nav-primary\s*\{([^}]+)\}/,
  (match, content) => {
    return `.btn-nav-primary {` + content.replace(/transition:[^;]+;/, 'transition: transform 0.2s var(--ease-apple), background-color 0.2s var(--ease-apple);') + `}`;
  }
);

css = css.replace(
  /\.btn-hero-dark\s*\{([^}]+)\}/,
  (match, content) => {
    return `.btn-hero-dark {` + content.replace(/transition:[^;]+;/, 'transition: transform 0.2s var(--ease-apple), background-color 0.2s var(--ease-apple), box-shadow 0.2s var(--ease-apple);') + `}`;
  }
);

css = css.replace(
  /\.btn-tier-outline\s*\{([^}]+)\}/,
  (match, content) => {
    return `.btn-tier-outline {` + content.replace(/transition:[^;]+;/, 'transition: transform 0.2s var(--ease-apple), background-color 0.2s var(--ease-apple), border-color 0.2s var(--ease-apple);') + `}`;
  }
);

css = css.replace(
  /\.btn-tier-dark\s*\{([^}]+)\}/,
  (match, content) => {
    return `.btn-tier-dark {` + content.replace(/transition:[^;]+;/, 'transition: transform 0.2s var(--ease-apple), background-color 0.2s var(--ease-apple);') + `}`;
  }
);

// Accessibility media queries
const accessibilityCss = `
/* ==========================================================
   APPLE ACCESSIBILITY & REDUCED MOTION / TRANSPARENCY
   ========================================================== */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
  .rotating {
    animation: none !important;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .top-nav,
  .dash-card,
  .mockup-frame,
  .modal,
  .glass-panel {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    background-color: #ffffff !important;
  }
}
`;

if (!css.includes('APPLE ACCESSIBILITY & REDUCED MOTION')) {
  css += '\n' + accessibilityCss;
}

fs.writeFileSync(cssPath, css, 'utf8');
console.log('✓ public/style.css polished with Apple Design tokens');

// 2. UPDATE public/dashboard.html
const dashPath = path.join(__dirname, '..', 'public', 'dashboard.html');
let dash = fs.readFileSync(dashPath, 'utf8');

const dashAppleStyles = `
    /* Apple Touch & Physical Press Feedback */
    button, .btn-outline, .btn-send-test, .tab-btn {
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    button:active,
    .btn-outline:active,
    .btn-send-test:active,
    .tab-btn:active {
      transform: scale(0.975);
      transition: transform 100ms var(--ease-apple-press, cubic-bezier(0.2, 0, 0, 1)) !important;
    }
    .dash-card {
      box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.85);
    }
    .switch .slider {
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .switch .slider:before {
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 2px 4px rgba(0,0,0,0.18);
    }
    input:checked + .slider {
      background-color: #10b981;
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
      }
    }
    @media (prefers-reduced-transparency: reduce) {
      .top-nav, .dash-card {
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        background-color: #ffffff !important;
      }
    }
`;

if (!dash.includes('Apple Touch & Physical Press Feedback')) {
  dash = dash.replace('</style>', dashAppleStyles + '\n  </style>');
  fs.writeFileSync(dashPath, dash, 'utf8');
  console.log('✓ public/dashboard.html polished with Apple Design tokens');
}

// 3. UPDATE public/login.html
const loginPath = path.join(__dirname, '..', 'public', 'login.html');
let login = fs.readFileSync(loginPath, 'utf8');

const loginAppleStyles = `
    /* Apple Touch & Physical Press Feedback */
    button, .btn-auth-submit, .auth-tab-btn {
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    button:active,
    .btn-auth-submit:active,
    .auth-tab-btn:active {
      transform: scale(0.975);
      transition: transform 100ms var(--ease-apple-press, cubic-bezier(0.2, 0, 0, 1)) !important;
    }
    .auth-card {
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.08), 0 0 1px 1px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.9);
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
      }
    }
`;

if (!login.includes('Apple Touch & Physical Press Feedback')) {
  login = login.replace('</style>', loginAppleStyles + '\n  </style>');
  fs.writeFileSync(loginPath, login, 'utf8');
  console.log('✓ public/login.html polished with Apple Design tokens');
}

// 4. UPDATE public/admin.html
const adminPath = path.join(__dirname, '..', 'public', 'admin.html');
let admin = fs.readFileSync(adminPath, 'utf8');

const adminAppleStyles = `
    /* Apple Touch & Physical Press Feedback */
    button, .btn-outline, .btn-action {
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    button:active,
    .btn-outline:active,
    .btn-action:active {
      transform: scale(0.975);
      transition: transform 100ms var(--ease-apple-press, cubic-bezier(0.2, 0, 0, 1)) !important;
    }
    .admin-stat-card, .admin-table-panel {
      box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.04), 0 2px 6px -1px rgba(0, 0, 0, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.85);
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
      }
    }
`;

if (!admin.includes('Apple Touch & Physical Press Feedback')) {
  admin = admin.replace('</style>', adminAppleStyles + '\n  </style>');
  fs.writeFileSync(adminPath, admin, 'utf8');
  console.log('✓ public/admin.html polished with Apple Design tokens');
}
