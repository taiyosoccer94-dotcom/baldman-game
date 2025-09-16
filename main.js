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

// 中央ヒットのしきい値（小さいほどシビア）
const CENTER_THRESH = 6;

let men = [];
let lastSpawn = 0;
let nextManId = 1;
let t0 = performance.now();

let wig = null; // {x,y,vy,falling,attached:{manId,dx,dy}}
let score = 0, best = Number(localStorage.getItem('bald_best')||0), drops = 0;
bestEl.textContent = best;

// 画面中央のデカ文字オーバーレイ
let overlayText = '';
let overlayTimer = 0;
let overlayColor = '#111';
function showOverlay(text, color = '#111', ms = 120) {
  overlayText = text;
  overlayColor = color;
  overlayTimer = Math.round(ms / (1000/60)); // 60fps換算
}
function clearOverlay(){ overlayText=''; overlayTimer=0; }

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

// ===== 取り付け =====
function attachToMan(m, dx, dy) {
  // 顔にかぶらないよう少し上げて取り付ける
  const lift = 15; // 上方向補正
  wig.attached = { manId: m.id, dx, dy: dy - lift };
  wig.falling = false;
  wig.vy = 0;
}

function checkHit(m) {
  const headCx = m.x;
  const headCy = m.y + m.headOffsetY;
  const onHeadY = Math.abs(wig.y - headCy) < HEAD_H*0.5;
  const onHeadX = Math.abs(wig.x - headCx);
  if (onHeadY && onHeadX < HEAD_W*0.6) {
    // 評価＆スコア
    const dx = onHeadX;
    let delta;
    const centered = dx < CENTER_THRESH;
    if (centered) { delta = 3; showOverlay('育毛成功！', '#0a7a0a', 120); }
    else          { delta = 1; showOverlay('育毛失敗！', '#cc1f1f', 120); }

    score += delta; scoreEl.textContent = score;
    best = Math.max(best, score); bestEl.textContent = best;
    localStorage.setItem('bald_best', best);

    // HUDの小メッセージも一応更新（任意）
    msgEl.textContent = centered ? '神フィット！+3' : '惜しい！+1';

    // そのときの相対位置を保持して取り付け
    const relDx = wig.x - headCx;
    const relDy = wig.y - headCy;
    attachToMan(m, relDx, relDy);
    return true;
  }
  return false;
}

// ===== ループ =====
function update(dt, now) {
  if (now - lastSpawn > SPAWN_EVERY) { spawnMan(); lastSpawn = now; }

  // 男移動
  men.forEach(m => { m.x += m.vx; });

  // 取り付け追従 or 落下
  if (wig.attached) {
    const a = wig.attached;
    const m = men.find(mm => mm.id === a.manId);
    if (m) {
      wig.x = m.x + a.dx;
      wig.y = m.y + m.headOffsetY + a.dy;
    } else {
      clearOverlay();
      resetWig();
    }
  } else if (wig.falling) {
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

  // 地面に落下→減点＆リセット
  const groundY = H - 110;
  if (!wig.attached && wig.y > groundY + 10) {
    showOverlay('育毛失敗！', '#cc1f1f', 120);
    score = Math.max(0, score - 1);
    scoreEl.textContent = score;
    setTimeout(() => { resetWig(); }, 350);
  }

  // 画面外の男を除去
  men = men.filter(m => m.x > -120 && m.x < W+120);

  // オーバーレイタイマー
  if (overlayTimer > 0) overlayTimer--;
  if (overlayTimer === 0 && overlayText) clearOverlay();
}

function render() {
  // 背景（白）＆地面（薄グレー）
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = '#dddddd'; ctx.fillRect(0, H-100, W, 100);

  // 男 → カツラ
  men.forEach(drawMan);
  drawWig();

  // 画面中央のデカ文字
  if (overlayTimer > 0) {
    ctx.save();
    ctx.font = `bold ${Math.max(36, Math.floor(W * 0.08))}px system-ui, sans-serif`;
    ctx.fillStyle = overlayColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 薄い縁取りで視認性を上げる
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeText(overlayText, W/2, H*0.35);
    ctx.fillText(overlayText, W/2, H*0.35);
    ctx.restore();
  }
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
