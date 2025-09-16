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
const WIG_SIZE = 26;            // カツラの見た目
const HEAD_W = 60, HEAD_H = 60; // 顔画像サイズ

let men = [];
let lastSpawn = 0;
let t0 = performance.now();

let wig = null; // {x,y,vy,falling,attached:{man,dx,dy}}  ※attachedがあれば頭に追従
let score = 0, best = Number(localStorage.getItem('bald_best')||0), drops = 0;
bestEl.textContent = best;

function resetWig() {
  wig = { x: W/2, y: 30, vy: 0, falling: false, attached: null };
}
resetWig();

// ===== 顔画像の読み込み =====
const faceImg = new Image();
faceImg.src = 'face.png';

// ===== 入力 =====
function drop() {
  // 既に落下中 or 取り付け中は無効化（シンプル仕様）
  if (wig.falling || wig.attached) return;
  wig.falling = true;
  wig.vy = 0;
  drops++; dropsEl.textContent = drops;
}
btn.addEventListener('click', drop);

let dragging = false;
cvs.addEventListener('pointerdown', e => {
  if (wig.falling || wig.attached) return; // 落下/取付中は位置操作しない
  dragging = true;
  const r = cvs.getBoundingClientRect();
  wig.x = e.clientX - r.left;
});
cvs.addEventListener('pointermove', e => {
  if (!dragging || wig.falling || wig.attached) return;
  const r = cvs.getBoundingClientRect();
  wig.x = e.clientX - r.left;
});
cvs.addEventListener('pointerup', () => { 
  if (dragging) drop(); 
  dragging = false; 
});

// ===== ユーティリティ =====
function spawnMan() {
  const y = H - 110;
  const speed = MAN_SPEED_BASE * (0.8 + Math.random()*0.6) * Math.max(0.8, scale);
  const startX = Math.random() < 0.5 ? -80 : W + 80;
  const dir = startX < 0 ? 1 : -1;
  const bodyW = 46, bodyH = 72;
  men.push({ x:startX, y, vx: speed*dir, bodyW, bodyH, headOffsetY: -bodyH - 8, alive: true });
}

function drawMan(m) {
  // 体
  ctx.fillStyle = '#6b4f2a';
  ctx.fillRect(m.x - m.bodyW/2, m.y - m.bodyH, m.bodyW, m.bodyH);
  // 首
  ctx.fillRect(m.x - 6, m.y - m.bodyH - 8, 12, 8);

  // 頭（顔画像を丸くクリッピング）
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
  ctx.beginPath();
  ctx.ellipse(m.x, m.y+4, 18, 6, 0, 0, Math.PI*2);
  ctx.fill();
}

// ===== 判定 =====
function attachWigToMan(m) {
  const headCx = m.x;
  const headCy = m.y + m.headOffsetY;
  // カツラの中心と頭中心の相対オフセット（頭の少し上に固定）
  const dx = 0;
  const dy = -6;
  wig.attached = { man: m, dx, dy };
  wig.falling = false;
  wig.vy = 0;
  wig.x = headCx + dx;
  wig.y = headCy + dy;
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
    attachWigToMan(m);           // ← 当たったら頭に取り付け
    return true;
  }
  return false;
}

let flashTimer = 0;
function flash(t){ flashTimer = 60; msgEl.textContent = t; }
function clearFlash(){ flashTimer = 0; msgEl.textContent=''; }

// ===== メインループ =====
function update(dt, now) {
  // スポーン
  if (now - lastSpawn > SPAWN_EVERY) {
    spawnMan();
    lastSpawn = now;
  }

  // 男の移動
  men.forEach(m => { m.x += m.vx; });

  // カツラ：落下 or 取り付け追従
  if (wig.attached) {
    const a = wig.attached;
    // 取り付け相手がまだ存在していれば追従
    if (men.includes(a.man)) {
      wig.x = a.man.x + a.dx;
      wig.y = a.man.y + a.dy + a.man.headOffsetY;
    } else {
      // 相手が画面外に去ったら次を投下できるようリセット
      clearFlash();
      resetWig();
    }
  } else if (wig.falling) {
    wig.vy += GRAVITY;
    wig.y  += wig.vy;
  }

  // 命中判定（落下中のみチェック）
  if (wig.falling) {
    for (const m of men) {
      if (Math.abs(m.x - wig.x) < 80 && Math.abs((m.y+m.headOffsetY) - wig.y) < 80) {
        if (checkHit(m)) break;
      }
    }
  }

  // 失敗：地面到達で減点してリセット
  const groundY = H - 110;
  if (!wig.attached && wig.y > groundY + 10) {
    flash('ドンマイ… -1');
    score = Math.max(0, score - 1);
    scoreEl.textContent = score;
    setTimeout(() => { clearFlash(); resetWig(); }, 350);
  }

  // 画面外へ出た男を除去
  const beforeCount = men.length;
  men = men.filter(m => m.x > -120 && m.x < W+120);
  // 取り付け先が消えたらwigもリセット（保険）
  if (wig.attached && !men.includes(wig.attached.man)) {
    clearFlash();
    resetWig();
  }

  // メッセージタイマー
  if (flashTimer > 0) { flashTimer--; if (flashTimer === 0) clearFlash(); }
}

function render() {
  // 背景（白） & 地面（薄グレー）
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = '#dddddd'; ctx.fillRect(0, H-100, W, 100);

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
