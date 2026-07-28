/* =========================================================
   วันนี้กินไรดี — script.js
   Vanilla JS (ES6+) — ไม่ใช้ Framework
   ========================================================= */

'use strict';

/* ---------------- ค่าคงที่ ---------------- */
const budgetName = {
  1: 'ต่ำกว่า 50 บาท',
  2: '50–100 บาท',
  3: '100–200 บาท',
  4: 'มากกว่า 200 บาท',
};

const STORAGE_KEYS = {
  favorites: 'wkd_favorites',
  ratings: 'wkd_ratings',
};

/* ---------------- สถานะแอป ---------------- */
let DISHES = [];              // ฐานข้อมูลเมนูทั้งหมด (โหลดจาก dishes.json)
let filteredPool = [];        // เมนูที่ผ่านตัวกรองล่าสุด
let currentDish = null;       // เมนูที่กำลังแสดงผลอยู่
const excludedIds = new Set(); // เมนูที่ผู้ใช้กด "ไม่เอาเมนูนี้" (รีเซ็ตเมื่อรีเฟรชหน้า)

const selectedCats = new Set();
const selectedTastes = new Set();
const selectedIngredients = new Set();
const selectedBudgets = new Set(); // เก็บเป็น string ของตัวเลข เช่น "1","2"

/* ---------------- อ้างอิง DOM ---------------- */
const rollBtn = document.getElementById('rollBtn');
const rerollBtn = document.getElementById('rerollBtn');
const excludeBtn = document.getElementById('excludeBtn');
const favBtn = document.getElementById('favBtn');
const resultCard = document.getElementById('resultCard');
const emptyMsg = document.getElementById('emptyMsg');
const countNote = document.getElementById('countNote');
const starsWrap = document.getElementById('stars');
const rateMsg = document.getElementById('rateMsg');

const rateMessages = {
  1: 'ไม่ถูกใจเลย ลองสุ่มใหม่ดีกว่า 😅',
  2: 'เฉยๆ นะ ลองอีกทีไหม',
  3: 'พอใช้ได้ 🙂',
  4: 'อร่อยดี น่าลอง! 😋',
  5: 'ใช่เลย! มื้อนี้ปังแน่นอน 🤩',
};

/* =========================================================
   1) โหลดฐานข้อมูลเมนู
   ========================================================= */
async function loadMenu() {
  const res = await fetch('dishes.json');
  DISHES = await res.json();
}

/* =========================================================
   2) ระบบ localStorage: รายการโปรด + คะแนน
   ========================================================= */
function getFavorites() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.favorites);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveFavorites(favSet) {
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify([...favSet]));
}

function toggleFavorite(dishId) {
  const favs = getFavorites();
  if (favs.has(dishId)) favs.delete(dishId);
  else favs.add(dishId);
  saveFavorites(favs);
  return favs.has(dishId);
}

function getRatings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ratings);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveRating(dishId, value) {
  const ratings = getRatings();
  ratings[dishId] = value;
  localStorage.setItem(STORAGE_KEYS.ratings, JSON.stringify(ratings));
}

/* =========================================================
   3) ตัวกรอง (Filter) — ทุกกลุ่มเป็น multi-select
   ========================================================= */
function wireChipRow(rowId, chipClass, dataAttr, stateSet) {
  document.getElementById(rowId).addEventListener('click', (e) => {
    const btn = e.target.closest(`.chip.${chipClass}`);
    if (!btn) return;
    const value = btn.dataset[dataAttr];
    if (stateSet.has(value)) {
      stateSet.delete(value);
      btn.classList.remove('active');
    } else {
      stateSet.add(value);
      btn.classList.add('active');
    }
  });
}

function initFilterChips() {
  wireChipRow('catRow', 'cat', 'cat', selectedCats);
  wireChipRow('tasteRow', 'taste', 'taste', selectedTastes);
  wireChipRow('ingRow', 'ing', 'ing', selectedIngredients);
  wireChipRow('budgetRow', 'budget', 'budget', selectedBudgets);
}

function matchesFilters(dish) {
  const catOk = selectedCats.size === 0 || dish.category.some((c) => selectedCats.has(c));
  const tasteOk = selectedTastes.size === 0 || dish.taste.some((t) => selectedTastes.has(t));
  const ingOk = selectedIngredients.size === 0 || dish.ingredient.some((i) => selectedIngredients.has(i));
  const budgetOk = selectedBudgets.size === 0 || selectedBudgets.has(String(dish.budget));
  return catOk && tasteOk && ingOk && budgetOk;
}

function getFilteredPool() {
  return DISHES.filter((d) => matchesFilters(d) && !excludedIds.has(d.id));
}

/* =========================================================
   4) ระบบสุ่มเมนู
   ========================================================= */
function handleRollClick() {
  filteredPool = getFilteredPool();
  if (filteredPool.length === 0) {
    showEmptyMessage();
    return;
  }
  hideEmptyMessage();
  spinAndPick(filteredPool);
}

function handleRerollClick() {
  // ใช้ตัวกรองเดิมทั้งหมด ไม่ต้องให้ผู้ใช้เลือกใหม่
  const pool = getFilteredPool();
  if (pool.length === 0) {
    showEmptyMessage();
    resultCard.classList.remove('show');
    return;
  }
  spinAndPick(pool);
}

function handleExcludeClick() {
  if (!currentDish) return;
  excludedIds.add(currentDish.id);
  // สุ่มใหม่ทันทีจากพูลที่เหลือ (ไม่รวมเมนูที่เพิ่งตัดออก)
  const pool = getFilteredPool();
  if (pool.length === 0) {
    resultCard.classList.remove('show');
    showEmptyMessage();
    return;
  }
  spinAndPick(pool);
}

function spinAndPick(pool) {
  rollBtn.disabled = true;
  rerollBtn.disabled = true;
  excludeBtn.disabled = true;
  resultCard.classList.remove('show');

  const emojiEl = document.getElementById('emojiFallback');
  const imgEl = document.getElementById('dishImg');
  const nameEl = document.getElementById('dishName');
  imgEl.style.display = 'none';
  emojiEl.style.display = 'block';

  let ticks = 0;
  const maxTicks = 14;
  const interval = setInterval(() => {
    const r = pool[Math.floor(Math.random() * pool.length)];
    emojiEl.textContent = r.emoji;
    nameEl.textContent = r.name;
    ticks++;
    if (ticks >= maxTicks) {
      clearInterval(interval);
      finalizePick(pool);
    }
  }, 70 + ticks * 8);
}

function finalizePick(pool) {
  const dish = pool[Math.floor(Math.random() * pool.length)];
  currentDish = dish;
  renderResult(dish);

  rollBtn.disabled = false;
  rerollBtn.disabled = false;
  excludeBtn.disabled = false;
}

/* =========================================================
   5) แสดงผลลัพธ์
   ========================================================= */
function renderResult(dish) {
  document.getElementById('resCat').textContent = dish.category.join(' / ');
  document.getElementById('resBudget').textContent = budgetName[dish.budget];
  document.getElementById('dishName').textContent = dish.name;
  document.getElementById('dishDesc').textContent = dish.description || '';

  renderTagPills(dish);
  renderImage(dish);
  renderFavButton(dish);
  renderStars(dish);

  resultCard.classList.add('show');
}

function renderTagPills(dish) {
  const tagWrap = document.getElementById('tasteTags');
  tagWrap.innerHTML = '';
  dish.taste.forEach((t) => tagWrap.appendChild(makePill(t, 'taste-pill')));
  dish.ingredient.forEach((i) => tagWrap.appendChild(makePill(i, 'ing-pill')));
}

function makePill(text, className) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function renderImage(dish) {
  const emojiEl = document.getElementById('emojiFallback');
  const imgEl = document.getElementById('dishImg');

  // ห้ามดึงรูปจากภายนอก: ใช้ images/ ในโปรเจกต์เท่านั้น ถ้าไม่มีรูปให้ใช้ emoji
  if (dish.image) {
    imgEl.onload = () => {
      imgEl.style.display = 'block';
      emojiEl.style.display = 'none';
    };
    imgEl.onerror = () => {
      imgEl.style.display = 'none';
      emojiEl.style.display = 'block';
    };
    imgEl.src = `images/${dish.image}`;
    imgEl.alt = dish.name;
  } else {
    imgEl.style.display = 'none';
    emojiEl.textContent = dish.emoji;
    emojiEl.style.display = 'block';
  }
}

function renderFavButton(dish) {
  const favs = getFavorites();
  const isFav = favs.has(dish.id);
  favBtn.textContent = isFav ? '❤️' : '🤍';
  favBtn.classList.toggle('on', isFav);
}

function renderStars(dish) {
  const ratings = getRatings();
  const currentRating = ratings[dish.id] || 0;
  applyStarDisplay(currentRating);
  rateMsg.textContent = currentRating ? rateMessages[currentRating] : '';
}

function applyStarDisplay(value) {
  document.querySelectorAll('.star-btn').forEach((s) => {
    s.classList.toggle('on', parseInt(s.dataset.v, 10) <= value);
  });
}

/* =========================================================
   6) UI helpers
   ========================================================= */
function showEmptyMessage() {
  emptyMsg.style.display = 'block';
}
function hideEmptyMessage() {
  emptyMsg.style.display = 'none';
}

/* =========================================================
   7) Event bindings
   ========================================================= */
function initEventListeners() {
  rollBtn.addEventListener('click', handleRollClick);
  rerollBtn.addEventListener('click', handleRerollClick);
  excludeBtn.addEventListener('click', handleExcludeClick);

  favBtn.addEventListener('click', () => {
    if (!currentDish) return;
    const isFav = toggleFavorite(currentDish.id);
    favBtn.textContent = isFav ? '❤️' : '🤍';
    favBtn.classList.toggle('on', isFav);
  });

  starsWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('.star-btn');
    if (!btn || !currentDish) return;
    const value = parseInt(btn.dataset.v, 10);
    applyStarDisplay(value);
    rateMsg.textContent = rateMessages[value];
    saveRating(currentDish.id, value);
  });
}

/* =========================================================
   8) เริ่มต้นแอป
   ========================================================= */
async function initApp() {
  initFilterChips();
  initEventListeners();

  try {
    await loadMenu();
    countNote.textContent = `ฐานข้อมูล ${DISHES.length} เมนู`;
    rollBtn.disabled = false;
  } catch (err) {
    countNote.textContent = 'โหลดฐานข้อมูลเมนูไม่สำเร็จ ลองรีเฟรชหน้าใหม่';
    console.error('loadMenu failed:', err);
  }
}

document.addEventListener('DOMContentLoaded', initApp);
