// game.js
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let wig = { x: 200, y: 0, falling: false };
let man = { x: 0, y: 500 };

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // 男
  ctx.fillStyle = "brown";
  ctx.fillRect(man.x, man.y, 50, 50);
  // カツラ
  ctx.fillStyle = "black";
  ctx.beginPath();
  ctx.arc(wig.x, wig.y, 15, 0, Math.PI * 2);
  ctx.fill();

  // 移動
  man.x += 2;
  if (wig.falling) wig.y += 5;

  // 判定
  if (wig.y > man.y && wig.y < man.y + 50) {
    const dx = Math.abs(wig.x - (man.x + 25));
    if (dx < 10) alert("完璧！");
    else if (dx < 30) alert("ちょっとズレた！");
    else alert("落下事故！");
    reset();
  }

  requestAnimationFrame(draw);
}

function dropWig() {
  wig.falling = true;
}

function reset() {
  wig.y = 0;
  wig.falling = false;
  man.x = 0;
}

draw();
