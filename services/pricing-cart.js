/* pricing-cart.js — shared cart logic for all pricing pages */

const PRICES = {
  packages: {
    chapter: 800, novel: 1400, epic: 2400,
    portraiture: 350, 'product-brand': 500,
    hybrid: 1200, multiday: 2200, campaign: 3800
  },
  addons: {
    'vintage-glass': 150,
    'film-35mm': 200,
    'macro': 100,
    'drone': 300,
    'audio': 250,
    'lighting': 200,
    'longform': 300,
    'broll': 150,
    'extra-revision': 75,
    'plus-3min': 150,
    'extra-retouching': 50,
    'plus-5selects': 75
  }
};

const PAYMENT_PAGES = {
  chapter: 'quote.html',
  novel: 'quote.html',
  epic: 'quote.html',
  portraiture: 'quote.html',
  'product-brand': 'quote.html',
  hybrid: 'quote.html',
  multiday: 'quote.html',
  campaign: 'quote.html'
};

const PACKAGE_LABELS = {
  chapter: 'Chapter', novel: 'Novel', epic: 'Epic',
  portraiture: 'Portraiture', 'product-brand': 'Product / Brand',
  hybrid: 'Hybrid', multiday: 'Multi-Day', campaign: 'Campaign'
};

const ADDON_LABELS = {
  'vintage-glass': 'Vintage Glass',
  'film-35mm': '35mm Film',
  'macro': 'Macro',
  'drone': 'Drone',
  'audio': 'Audio',
  'lighting': 'Lighting Extras',
  'longform': 'Long-Form Video',
  'broll': 'B-Roll',
  'extra-revision': 'Extra Revisions',
  'plus-3min': 'Add Length to Edited Videos',
  'extra-retouching': 'Extra Retouching',
  'plus-5selects': '+5 Selects'
};

// addons is now a plain object: { key: quantity }
let cart = { package: null, addons: {} };

// ── Cart persistence across page navigation ────────────────────────────────
const CART_KEY = 'hm_cart';
function saveCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch(e) {}
}
function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && typeof saved === 'object') {
        cart.package = saved.package || null;
        cart.addons  = saved.addons  || {};
      }
    }
  } catch(e) {}
}

// ── Add-to-cart fly animation ──────────────────────────────────────────────
let _lastAddonClickEl = null;

function flyChip(fromEl, toEl) {
  if (!fromEl || !toEl) return;

  const srcR = fromEl.getBoundingClientRect();
  const dstR = toEl.getBoundingClientRect();

  const srcX = srcR.left + srcR.width  / 2;
  const srcY = srcR.top  + srcR.height / 2;
  const dstX = dstR.left + dstR.width  / 2;
  const dstY = dstR.top  + dstR.height / 2;

  // Arc: control point lifted 56px above the straight midpoint
  const midX = (srcX + dstX) / 2;
  const midY = srcY + (dstY - srcY) * 0.35 - 56;

  const chip = document.createElement('div');
  chip.textContent = '+1';
  Object.assign(chip.style, {
    position:     'fixed',
    left:         '0',
    top:          '0',
    fontFamily:   "'Cinzel', serif",
    fontSize:     '0.68rem',
    fontWeight:   '700',
    color:        '#1C1A14',
    background:   '#C9A84C',
    borderRadius: '50px',
    padding:      '3px 10px',
    zIndex:       '100000',
    pointerEvents:'none',
    willChange:   'transform, opacity',
    transform:    `translate(${srcX}px,${srcY}px) translate(-50%,-50%)`,
  });
  document.body.appendChild(chip);

  const anim = chip.animate([
    { transform: `translate(${srcX}px,${srcY}px) translate(-50%,-50%) scale(1)`,    opacity: 1 },
    { transform: `translate(${midX}px,${midY}px) translate(-50%,-50%) scale(1.25)`, opacity: 1 },
    { transform: `translate(${dstX}px,${dstY}px) translate(-50%,-50%) scale(0.5)`,  opacity: 0 },
  ], { duration: 1100, easing: 'cubic-bezier(0.22,1,0.36,1)', fill: 'forwards' });
  anim.onfinish = () => chip.remove();

  // Pulse the destination on arrival
  setTimeout(() => {
    toEl.animate([
      { transform: 'scale(1)',    boxShadow: '0 0 0 0 rgba(201,168,76,0)' },
      { transform: 'scale(1.07)', boxShadow: '0 0 0 6px rgba(201,168,76,0.3)' },
      { transform: 'scale(1)',    boxShadow: '0 0 0 0 rgba(201,168,76,0)' },
    ], { duration: 300, easing: 'ease-out' });
  }, 1020);
}

function flyToCart(addonEl) {
  const btn = document.getElementById('cb-proceed');
  const bar = document.getElementById('cart-bar');
  if (!addonEl || !btn || !bar || !bar.classList.contains('cart-bar--visible')) return;
  flyChip(addonEl, btn);
}

function flyFromCart(addonEl) {
  const btn = document.getElementById('cb-proceed');
  const bar = document.getElementById('cart-bar');
  if (!addonEl || !btn || !bar || !bar.classList.contains('cart-bar--visible')) return;
  flyChip(btn, addonEl);
}

function calcTotal() {
  if (!cart.package) return 0;
  let t = PRICES.packages[cart.package] || 0;
  Object.entries(cart.addons).forEach(([key, qty]) => {
    if (qty > 0) t += (PRICES.addons[key] || 0) * qty;
  });
  return t;
}

function renderBar() {
  const bar = document.getElementById('cart-bar');
  if (!bar) return;
  const pkgDisplay = document.getElementById('cb-package');
  const addonsDisplay = document.getElementById('cb-addons');
  const totalDisplay = document.getElementById('cb-total');
  const proceedBtn = document.getElementById('cb-proceed');

  // Always sync addon visual states regardless of package selection
  document.querySelectorAll('.addon-toggle[data-addon]').forEach(btn => {
    const key = btn.dataset.addon;
    const qty = cart.addons[key] || 0;
    btn.classList.toggle('addon-toggle--active', qty > 0);
  });
  document.querySelectorAll('.cart-qty-display[data-addon]').forEach(el => {
    el.textContent = cart.addons[el.dataset.addon] || 0;
  });

  const hasAddons = Object.values(cart.addons).some(qty => qty > 0);
  if (!cart.package && !hasAddons) {
    bar.classList.remove('cart-bar--visible');
    return;
  }

  bar.classList.add('cart-bar--visible');
  if (pkgDisplay) pkgDisplay.textContent = cart.package ? (PACKAGE_LABELS[cart.package] || cart.package) : '—';

  if (addonsDisplay) {
    const active = Object.entries(cart.addons)
      .filter(([, qty]) => qty > 0)
      .map(([key, qty]) => qty > 1 ? `${ADDON_LABELS[key] || key} ×${qty}` : (ADDON_LABELS[key] || key));
    addonsDisplay.textContent = active.length ? active.join(', ') : 'No add-ons';
  }

  if (totalDisplay) totalDisplay.style.display = 'none';

  if (proceedBtn) {
    proceedBtn.onclick = () => {
      const page = PAYMENT_PAGES[cart.package] || 'quote.html';
      const addonsArr = Object.entries(cart.addons)
        .filter(([, qty]) => qty > 0)
        .map(([key, qty]) => qty > 1 ? `${key}:${qty}` : key);
      const params = [];
      if (cart.package) params.push(`package=${cart.package}`);
      if (addonsArr.length) params.push(`addons=${addonsArr.join(',')}`);
      window.location.href = page + (params.length ? `?${params.join('&')}` : '');
    };
  }

  // Sync pkg-tier tiles (cart section)
  document.querySelectorAll('.pkg-tier[data-tier]').forEach(t => {
    t.classList.toggle('selected', t.dataset.tier === cart.package);
    // Clear any lingering inline style so the CSS class is the sole controller
    const hint = t.querySelector('.tier-select-hint');
    if (hint) hint.style.opacity = '';
  });

  // Sync coin cards (same source of truth)
  document.querySelectorAll('.coin-card[id^="coin-"]').forEach(c => {
    c.classList.toggle('selected', c.id === 'coin-' + cart.package);
  });

  // Floating arrow above the proceed button
  const arrow = document.getElementById('cart-arrow');
  if (arrow) {
    const PKG_COLORS = {
      chapter: '#8B1020', novel: '#0F5C2B', epic: '#C9A84C',
      hybrid: '#5C6E82', multiday: '#5C6E82', campaign: '#C9A84C'
    };
    if (cart.package && bar.classList.contains('cart-bar--visible')) {
      arrow.style.color = PKG_COLORS[cart.package] || '#C9A84C';
      // Position arrow centred above the proceed button after bar slides in
      setTimeout(() => {
        const btn = document.getElementById('cb-proceed');
        if (!btn) return;
        const bRect = btn.getBoundingClientRect();
        const barRect = bar.getBoundingClientRect();
        const btnCentreX = bRect.left + bRect.width / 2;
        const rightOffset = barRect.right - btnCentreX - 15; // 15 = half arrow width
        arrow.style.right = rightOffset + 'px';
        arrow.classList.add('cart-arrow--visible');
      }, 420); // wait for cart-bar slide-in (0.4s transition)
    } else {
      arrow.classList.remove('cart-arrow--visible');
    }
  }
}

function selectPackage(tier) {
  cart.package = tier;
  saveCart();
  renderBar();
}

// For toggle-style addons (qty 0 or 1)
function toggleAddon(addonKey) {
  const wasOff = (cart.addons[addonKey] || 0) === 0;
  cart.addons[addonKey] = wasOff ? 1 : 0;
  if (wasOff) flyToCart(_lastAddonClickEl);
  saveCart();
  renderBar();
}

// For quantity-based addons — delta is +1 or -1
function setAddonQty(key, delta) {
  const current = cart.addons[key] || 0;
  const next = Math.max(0, current + delta);
  cart.addons[key] = next;
  if (delta > 0 && next > 0) flyToCart(_lastAddonClickEl);
  // Update qty displays inside panels
  const panelQty = document.getElementById('qty-' + key);
  if (panelQty) panelQty.textContent = next;
  // Update the fold-out button state
  const foldBtn = document.querySelector(`.addon-fold-btn[data-key="${key}"]`);
  if (foldBtn) foldBtn.classList.toggle('active', next > 0);
  // Update add-btn label if present
  updateAddonQtyBtn(key, next);
  saveCart();
  renderBar();
}

function updateAddonQtyBtn(key, qty) {
  const btn = document.getElementById('btn-' + key);
  if (!btn) return;
  if (qty > 0) {
    btn.textContent = `Added ×${qty} ✓`;
    btn.classList.add('added');
  } else {
    const price = PRICES.addons[key] || 0;
    const labels = {
      'extra-revision': 'Add Revisions',
      'plus-3min': 'Add Length',
      'extra-retouching': 'Add Retouching',
      'plus-5selects': 'Add Selects'
    };
    btn.textContent = labels[key] || 'Add to Order';
    btn.classList.remove('added');
  }
}

// Scroll-reveal via IntersectionObserver
function initScrollReveal() {
  const els = document.querySelectorAll('.acc-item, .addon-btn-wrap, .compare-section, .cart-section');
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach(el => obs.observe(el));
}

// Macro collage scroll zoom
function initCollageZoom() {
  const zoom = document.getElementById('collage-zoom-img');
  if (!zoom) return;
  const collage = document.getElementById('macro-collage');
  if (!collage) return;
  window.addEventListener('scroll', () => {
    const rect = collage.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / (window.innerHeight + rect.height)));
    const scale = 1 + progress * 0.28;
    zoom.style.transform = `scale(${scale})`;
  }, { passive: true });
}

// Add-on fold-out buttons
function toggleAddonPanel(key) {
  const panel = document.getElementById('addon-panel-' + key);
  if (!panel) return;
  const isOpen = panel.classList.contains('addon-panel--open');
  // Close all panels
  document.querySelectorAll('.addon-panel').forEach(p => {
    p.classList.remove('addon-panel--open');
    p.style.maxHeight = '0';
  });
  document.querySelectorAll('.addon-fold-btn').forEach(b => b.classList.remove('active'));
  if (!isOpen) {
    panel.classList.add('addon-panel--open');
    panel.style.maxHeight = panel.scrollHeight + 'px';
    const btn = document.querySelector(`.addon-fold-btn[data-key="${key}"]`);
    if (btn) btn.classList.add('active');
    // If a qty add-on is already active, re-apply active state
    if ((cart.addons[key] || 0) > 0 && btn) btn.classList.add('active');
  }
}

// Comparison table fold-out
function toggleCompare() {
  const table = document.getElementById('compare-table');
  const btn = document.getElementById('compare-toggle-btn');
  if (!table) return;
  const isOpen = table.classList.contains('compare-table--open');
  table.classList.toggle('compare-table--open', !isOpen);
  table.style.maxHeight = isOpen ? '0' : table.scrollHeight + 'px';
  if (btn) btn.textContent = isOpen ? 'View Full Comparison ↓' : 'Hide Comparison ↑';
}

document.addEventListener('DOMContentLoaded', () => {
  loadCart();   // restore cart before first renderBar
  renderBar();  // sync UI to restored state
  initScrollReveal();
  initCollageZoom();

  // Capture the clicked addon element before onclick fires, so flyToCart knows the source
  document.body.addEventListener('click', e => {
    const src = e.target.closest('.addon-toggle, .addon-add-btn, .aq-btn');
    if (src) _lastAddonClickEl = src;
  }, true); // capture phase — runs before onclick attributes
});

// Reposition arrow on resize
window.addEventListener('resize', () => {
  const arrow = document.getElementById('cart-arrow');
  const bar = document.getElementById('cart-bar');
  const btn = document.getElementById('cb-proceed');
  if (!arrow || !bar || !btn || !bar.classList.contains('cart-bar--visible')) return;
  const bRect = btn.getBoundingClientRect();
  const barRect = bar.getBoundingClientRect();
  arrow.style.right = (barRect.right - (bRect.left + bRect.width / 2) - 15) + 'px';
}, { passive: true });
