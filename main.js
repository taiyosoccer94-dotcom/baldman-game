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
const GRAVITY = 0.55;           // 重力
const SPAWN_EVERY = 1200;       // 男の出現間隔(ms)
const MAN_SPEED_BASE = 1.6;     // 男の速度
const WIG_SIZE = 26;            // カツラの外観サイズ
const HEAD_W = 60, HEAD_H = 60; // 画像の頭サイズ

let men = [];
let lastSpawn = 0;
let t0 = performance.now();

let wig = null;
let score = 0, best = Number(localStorage.getItem('bald_best')||0), drops = 0;
bestEl.textContent = best;

function resetWig() {
  wig = { x: W/2, y: 30, vy: 0, falling: false };
}
resetWig();

// ===== 顔画像の読み込み =====
const faceImg = new Image();
faceImg.src = 'face.png';  // ←リポジトリにアップロードした顔画像ファイル名

// ===== 入力 =====
function drop() {
  if (!wig.falling) {
    wig.falling = true;
    wig.vy = 0;
    drops++; dropsEl.textContent = drops;
  }
}
btn.addEventListener('click', drop);

let dragging = false;
cvs.addEventListener('pointerdown', e => {
  dragging = true;
  const r = cvs.getBoundingClientRect();
  wig.x = e.clientX - r.left;
});
cvs.addEventListener('pointermove', e => {
  if (!dragging) return;
  const r = cvs.getBoundingClientRect();
  wig.x = e.clientX - r.left;
});
cvs.addEventListener('pointerup', () => { dragging = false; drop(); });

// ===== ユーティリティ =====
function rand(a,b){ return a + Math.random()*(b-a); }

function spawnMan() {
  const y = H - 110;
  const speed = MAN_SPEED_BASE * (0.8 + Math.random()*0.6) * Math.max(0.8, scale);
  const startX = Math.random() < 0.5 ? -80 : W + 80;
  const dir = startX < 0 ? 1 : -1;
  const bodyW = 46, bodyH = 72;
  men.push({ x:startX, y, vx: speed*dir, bodyW, bodyH, headOffsetY: -bodyH - 8 });
}

function drawMan(m) {
  // 体
  ctx.fillStyle = '#6b4f2a';
  ctx.fillRect(m.x - m.bodyW/2, m.y - m.bodyH, m.bodyW, m.bodyH);
  // 首
  ctx.fillRect(m.x - 6, m.y - m.bodyH - 8, 12, 8);

  // 頭（画像）
  const headX = m.x - HEAD_W/2;
  const headY = m.y + m.headOffsetY - HEAD_H/2;
  if (faceImg.complete) {
    ctx.drawImage(faceImg, headX, headY, HEAD_W, HEAD_H);
  } else {
    ctx.fillStyle = '#ccc';
    ctx.beginPath();
    ctx.arc(m.x, m.y + m.headOffsetY, HEAD_W/2, 0, Math.PI*2);
    ctx.fill();
  }

  // 地面影
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath();
  ctx.ellipse(m.x, m.y+4, 18, 6, 0, 0, Math.PI*2);
  ctx.fill();
}

// ===== 判定 =====
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
    wig.falling = false;
    wig.y = headCy - 6;
    return true;
  }
  return false;
}

let flashTimer = 0;
function flash(t){ flashTimer = 60; msgEl.textContent = t; }
function clearFlash(){ flashTimer = 0; msgEl.textContent=''; }

// ===== メインループ =====
function update(dt, now) {
  if (now - lastSpawn > SPAWN_EVERY) {
    spawnMan();
    lastSpawn = now;
  }
  men.forEach(m => m.x += m.vx);
  men = men.filter(m => m.x > -120 && m.x < W+120);

  if (wig.falling) {
    wig.vy += GRAVITY;
    wig.y  += wig.vy;
  }

  for (const m of men) {
    if (Math.abs(m.x - wig.x) < 80 && Math.abs((m.y+m.headOffsetY) - wig.y) < 80) {
      if (checkHit(m)) break;
    }
  }

  const groundY = H - 110;
  if (wig.y > groundY + 10) {
    flash('ドンマイ… -1');
    score = Math.max(0, score - 1);
    scoreEl.textContent = score;
    setTimeout(() => { clearFlash(); resetWig(); }, 350);
  }

  if (flashTimer > 0) {
    flashTimer--; if (flashTimer === 0) clearFlash();
  }
}
/*
function render() {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,W,H);
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#10131a'); g.addColorStop(1,'#0b0b0b');
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

  ctx.fillStyle = '#1f1f1f';
  ctx.fillRect(0, H-100, W, 100);

  men.forEach(drawMan);
  drawWig();
}
*/

function render() {
  // 背景を白に変更
  ctx.fillStyle = '#ffffff'; 
  ctx.fillRect(0,0,W,H);

  // 地面をグレーっぽく
  ctx.fillStyle = '#dddddd';
  ctx.fillRect(0, H-100, W, 100);

  // 男たち
  men.forEach(drawMan);

  // カツラ
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
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  ctx.beginPath(); ctx.ellipse(x-6,y-4,10,6,0,0,Math.PI*2); ctx.fill();
}

function loop(now){
  const dt = now - t0; t0 = now;
  update(dt, now);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);


