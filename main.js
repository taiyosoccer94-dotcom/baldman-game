// ===== 基本設定 =====
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d', { alpha: false });
const scoreEl = document.getElementById('score');
const bestEl  = document.getElementById('best');
const dropsEl = document.getElementById('drops');
const msgEl   = document.getElementById('msg');
const btn     = document.getElementById('btn');

let W, H, scale;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = cvs.clientWidth;
  H = window.innerHeight - document.querySelector('#hud').clientHeight - document.querySelector('header').clientHeight;
  cvs.width  = Math.floor(W * dpr);
  cvs.height = Math.floor(H * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  scale = Math.min(W/400, H/700) || 1;
}
addEventListener('resize', resize);
resize();

// ===== ゲーム状態 =====
const GRAVITY = 0.55;
const SPAWN_EVERY = 1200;
const MAN_SPEED_BASE = 1.6;
const WIG_SIZE = 26;
const HEAD_W = 60, HEAD_H = 60;

let men = [];
let lastSpawn = 0;
let nextManId = 1;
let t0 = performance.now();

let wig = null; // {x,y,vy,falling,attached:{manId,dx,dy}}
let score = 0, best = Number(localStorage.getItem('bald_best')||0), drops = 0;
bestEl.textContent = best;

function resetWig() {
  wig = { x: W/2, y: 30, vy: 0, falling: false, attached: null };
}
resetWig();

// ===== 顔画像 =====
const faceImg = new Image();
faceImg.src = 'face.png';

// ===== 入力 =====
function drop() {
  if (wig.falling || wig.attached) return;
  wig.falling = true;
  wig.vy = 0;
  drops++; dropsEl.textContent = drops;
}
btn.addEventListener('click', drop);

let dragging = false;
cvs.addEventListener('pointerdown', e => {
  if (wig.falling || wig.attached) return;
  dragging = true;
  const r = cvs.getBoundingClientRect();
  wig.x = e.clientX - r.left;
});
cvs.addEventListener('pointermove', e => {
  if (!dragging || wig.falling || wig.attached) return;
  const r = cvs.getBoundingClientRect();
  wig.x = e.clientX - r.left;
});
cvs.addEventListener('pointerup', () => { if (dragging) drop(); dragging = false; });

// ===== ユーティリティ =====
function spawnMan() {
  const y = H - 110;
  const speed = MAN_SPEED_BASE * (0.8 + Math.random()*0.6) * Math.max(0.8, scale);
  const startX = Math.random() < 0.5 ? -80 : W + 80;
  const dir = startX < 0 ? 1 : -1;
  const bodyW = 46, bodyH = 72;
  men.push({ id: nextManId++, x:startX, y, vx: speed*dir, bodyW, bodyH, headOffsetY: -bodyH - 8 });
}

function drawMan(m) {
  // 体
  ctx.fillStyle = '#6b4f2a';
  ctx.fillRect(m.x - m.bodyW/2, m.y - m.bodyH, m.bodyW, m.bodyH);
  // 首
  ctx.fillRect(m.x - 6, m.y - m.bodyH - 8, 12, 8);

  // 頭（丸く切り抜いた顔）
  const headX = m.x - HEAD_W/2;
  const headY = m.y + m.headOffsetY - HEAD_H/2;
  if (faceImg.complete) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(m.x, m.y + m.headOffsetY, HEAD_W/2, 0, Math.PI*2);
    ctx.clip();
    ctx.drawImage(faceImg, headX, headY, HEAD_W, HEAD_H);
    ctx.restore();
  } else {
    ctx.fillStyle = '#ccc';
    ctx.beginPath();
    ctx.arc(m.x, m.y + m.headOffsetY, HEAD_W/2, 0, Math.PI*2);
    ctx.fill();
  }

  // 影
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(m.x, m.y+4, 18, 6, 0, 0, Math.PI*2); ctx.fill();
}
/*
// ===== 取り付け =====
function attachToMan(m) {
  const headCx = m.x;
  const headCy = m.y + m.headOffsetY;
  // 衝突時の相対オフセットを保持（見た目がそのまま）
  const dx = wig.x - headCx;
  const dy = wig.y - headCy;
  wig.attached = { manId: m.id, dx, dy };
  wig.falling = false;
  wig.vy = 0;
}
*/
function attachToMan(m) {
  const headCx = m.x;
  const headCy = m.y + m.headOffsetY;
  // 取り付け時のオフセット（dxはそのまま、dyを上にずらす）
  const dx = wig.x - headCx;
  const dy = (wig.y - headCy) - 10;  // ← -15px ぶん上に乗せる
  wig.attached = { manId: m.id, dx, dy };
  wig.falling = false;
  wig.vy = 0;
}


function checkHit(m) {
  const headCx = m.x;
  const headCy = m.y + m.headOffsetY;
  const onHeadY = Math.abs(wig.y - headCy) < HEAD_H*0.5;
  const onHeadX = Math.abs(wig.x - headCx);
  if (onHeadY && onHeadX < HEAD_W*0.6) {
    const dx = onHeadX;
    let text, delta;
    if (dx < 6)       { text = '神フィット！+3'; delta = 3; }
    else if (dx < 14) { text = 'ナイス！+2';     delta = 2; }
    else              { text = '惜しい！+1';     delta = 1; }
    score += delta; scoreEl.textContent = score;
    best = Math.max(best, score); bestEl.textContent = best;
    localStorage.setItem('bald_best', best);
    flash(text);
    attachToMan(m);
    return true;
  }
  return false;
}

let flashTimer = 0;
function flash(t){ flashTimer = 60; msgEl.textContent = t; }
function clearFlash(){ flashTimer = 0; msgEl.textContent=''; }

// ===== ループ =====
function update(dt, now) {
  if (now - lastSpawn > SPAWN_EVERY) { spawnMan(); lastSpawn = now; }

  // 男を移動
  men.forEach(m => { m.x += m.vx; });

  // 取り付け追従
  if (wig.attached) {
    const a = wig.attached;
    const m = men.find(mm => mm.id === a.manId);
    if (m) {
      wig.x = m.x + a.dx;
      wig.y = m.y + m.headOffsetY + a.dy;
    } else {
      // 取り付け相手が画面外で消えたら次弾へ
      clearFlash();
      resetWig();
    }
  } else if (wig.falling) {
    // 落下
    wig.vy += GRAVITY;
    wig.y  += wig.vy;
  }

  // 命中判定（落下中のみ）
  if (wig.falling) {
    for (const m of men) {
      if (Math.abs(m.x - wig.x) < 80 && Math.abs((m.y+m.headOffsetY) - wig.y) < 80) {
        if (checkHit(m)) break;
      }
    }
  }

  // 地面に落ちたら減点＆リセット
  const groundY = H - 110;
  if (!wig.attached && wig.y > groundY + 10) {
    flash('ドンマイ… -1');
    score = Math.max(0, score - 1);
    scoreEl.textContent = score;
    setTimeout(() => { clearFlash(); resetWig(); }, 350);
  }

  // 画面外の男を除去
  men = men.filter(m => m.x > -120 && m.x < W+120);

  if (flashTimer > 0) { flashTimer--; if (flashTimer === 0) clearFlash(); }
}

function render() {
  // 背景（白）＆地面（薄グレー）
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = '#dddddd'; ctx.fillRect(0, H-100, W, 100);

  // 男 → カツラ（重ね順）
  men.forEach(drawMan);
  drawWig();
}

function drawWig(){
  const x = wig.x, y = wig.y;
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.ellipse(x, y, WIG_SIZE*0.9, WIG_SIZE*0.55, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath();
  ctx.moveTo(x - WIG_SIZE*0.9, y);
  ctx.bezierCurveTo(x - 10, y - 18, x + 10, y - 18, x + WIG_SIZE*0.9, y);
  ctx.lineTo(x + WIG_SIZE*0.9, y + 6);
  ctx.quadraticCurveTo(x, y + 16, x - WIG_SIZE*0.9, y + 6);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.08)';
  ctx.beginPath(); ctx.ellipse(x-6,y-4,10,6,0,0,Math.PI*2); ctx.fill();
}

function loop(now){
  const dt = now - t0; t0 = now;
  update(dt, now);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);


