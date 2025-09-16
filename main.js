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

// ===== ルール・定数 =====
const GRAVITY = 0.55;
const SPAWN_EVERY = 1200;
const MAN_SPEED_BASE = 1.6;
const WIG_SIZE = 26;
const HEAD_W = 60, HEAD_H = 60;
const CENTER_THRESH = 6;   // 真ん中ヒットのしきい値(px)
const LIFT_ON_ATTACH = 15; // 顔に被らないよう取り付け時に上げる量(px)

// ===== 状態 =====
let men = [];
let hats = []; // {manId, dx, dy} ← 頭に貼り付いたカツラ
let lastSpawn = 0;
let nextManId = 1;
let t0 = performance.now();

let wig = null; // 現在操作中のカツラ {x,y,vy,falling}
let score = 0, best = Number(localStorage.getItem('bald_best')||0), drops = 0;
bestEl.textContent = best;

function resetWig() {
  wig = { x: W/2, y: 30, vy: 0, falling: false };
}
resetWig();

// ===== 顔画像 =====
const faceImg = new Image();
faceImg.src = 'face.png';

// ===== 入力 =====
function drop() {
  if (wig.falling) return;
  wig.falling = true;
  wig.vy = 0;
  drops++; dropsEl.textContent = drops;
}
btn.addEventListener('click', drop);

let dragging = false;
cvs.addEventListener('pointerdown', e => {
  if (wig.falling) return;
  dragging = true;
  const r = cvs.getBoundingClientRect();
  wig.x = e.clientX - r.left;
});
cvs.addEventListener('pointermove', e => {
  if (!dragging || wig.falling) return;
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

// ===== オーバーレイ（中央デカ文字） =====
let overlayText = '';
let overlayTimer = 0;
let overlayColor = '#111';
function showOverlay(text, color = '#111', ms = 120) {
  overlayText = text; overlayColor = color;
  overlayTimer = Math.round(ms / (1000/60));
}
function clearOverlay(){ overlayText=''; overlayTimer=0; }

// ===== 当たり処理 =====
function attachAsHat(m) {
  const headCx = m.x;
  const headCy = m.y + m.headOffsetY;
  const relDx = wig.x - headCx;
  const relDy = (wig.y - headCy) - LIFT_ON_ATTACH; // 少し上に
  hats.push({ manId: m.id, dx: relDx, dy: relDy }); // ← 貼り付けを追加
  resetWig(); // ← 即座に次のカツラを準備！
}

function checkHit(m) {
  const headCx = m.x;
  const headCy = m.y + m.headOffsetY;
  const onHeadY = Math.abs(wig.y - headCy) < HEAD_H*0.5;
  const onHeadX = Math.abs(wig.x - headCx);
  if (onHeadY && onHeadX < HEAD_W*0.6) {
    const centered = onHeadX < CENTER_THRESH;
    const delta = centered ? 3 : 1;
    score += delta; scoreEl.textContent = score;
    best = Math.max(best, score); bestEl.textContent = best;
    localStorage.setItem('bald_best', best);
    msgEl.textContent = centered ? '神フィット' : 'イテッ';
    showOverlay(centered ? '育毛成功！' : '育毛失敗！', centered ? '#0a7a0a' : '#cc1f1f', overlayTimer ? overlayTimer* (1000/60) : 180);
    attachAsHat(m);
    return true;
  }
  return false;
}

// ===== ループ =====
function update(dt, now) {
  if (now - lastSpawn > SPAWN_EVERY) { spawnMan(); lastSpawn = now; }

  // 男移動
  men.forEach(m => { m.x += m.vx; });

  // 操作中のカツラ：落下
  if (wig.falling) {
    wig.vy += GRAVITY;
    wig.y  += wig.vy;
  }

  // 落下中のみ命中判定
  if (wig.falling) {
    for (const m of men) {
      if (Math.abs(m.x - wig.x) < 80 && Math.abs((m.y+m.headOffsetY) - wig.y) < 80) {
        if (checkHit(m)) break;
      }
    }
  }

  // 地面に落下→減点＆すぐ次へ
  const groundY = H - 110;
  if (wig.falling && wig.y > groundY + 10) {
    showOverlay('育毛失敗！', '#cc1f1f', 180);
    score = Math.max(0, score - 1);
    scoreEl.textContent = score;
    resetWig(); // ← これも即リセットで連射OK
  }

  // 画面外の男を除去
  men = men.filter(m => m.x > -120 && m.x < W+120);
  // 既にいない男に付いた帽子を除去
  hats = hats.filter(h => men.some(m => m.id === h.manId));

  // オーバーレイタイマー
  if (overlayTimer > 0) overlayTimer--;
  if (overlayTimer === 0 && overlayText) clearOverlay();
}

function render() {
  // 背景（白）＆地面（薄グレー）
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = '#dddddd'; ctx.fillRect(0, H-100, W, 100);

  // 男
  men.forEach(drawMan);

  // 頭に貼り付いたカツラ（複数）
  for (const h of hats) {
    const m = men.find(mm => mm.id === h.manId);
    if (!m) continue;
    const x = m.x + h.dx;
    const y = m.y + m.headOffsetY + h.dy;
    drawWigAt(x, y);
  }

  // 現在操作中のカツラ
  drawWigAt(wig.x, wig.y);

  // 画面中央のデカ文字
  if (overlayTimer > 0) {
    ctx.save();
    ctx.font = `bold ${Math.max(36, Math.floor(W * 0.08))}px system-ui, sans-serif`;
    ctx.fillStyle = overlayColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeText(overlayText, W/2, H*0.35);
    ctx.fillText(overlayText, W/2, H*0.35);
    ctx.restore();
  }
}

function drawWigAt(x, y){
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

