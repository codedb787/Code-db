"use strict";

/* ============================================================
   ARENA — 2P class-selection battle
   Ported from a Python/turtle prototype to plain canvas so it
   runs live, interactively, in any browser with no install.
   Coordinate system matches the original: origin at screen
   center, +x right, +y UP. toSX/toSY convert to canvas pixels
   only at draw time — all game logic stays in "turtle space".
   ============================================================ */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

function toSX(x) { return W / 2 + x; }
function toSY(y) { return H / 2 - y; }

// --- PHYSICS ---
const GRAVITY = -0.45;
const JUMP_STRENGTH = 11.5;
const MOVE_SPEED = 6.2;
const FRICTION = 0.85;

// --- PLATFORMS: [left_x, right_x, top_y, bottom_y] ---
const PLATFORMS = [
  [-450, 450, -250, -350], // main ground floor
  [-350, -150, -150, -170],
  [-50, 150, -150, -170],
  [250, 400, -150, -170],
  [-420, -250, -50, -70],
  [-100, 100, -50, -70],
  [150, 320, -50, -70],
  [-300, -100, 50, 30],
  [-120, 120, 150, 130],
];

// --- INPUT ---
const keys = {
  a: false, d: false, w: false, s: false,
  ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false,
  1: false, 2: false, 7: false, 8: false, r: false,
};
const trackedKeys = new Set(Object.keys(keys));
const preventDefaultFor = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "]);

window.addEventListener("keydown", (e) => {
  if (trackedKeys.has(e.key)) keys[e.key] = true;
  if (preventDefaultFor.has(e.key)) e.preventDefault();
});
window.addEventListener("keyup", (e) => {
  if (trackedKeys.has(e.key)) keys[e.key] = false;
});

// --- WEAPON CLASSES ---
const WEAPONS = {
  regular: { cooldown: 2.0, label: "REGULAR RIFLE" },
  pump: { cooldown: 3.5, label: "PUMP SHOTGUN" },
};

class Entity {
  constructor(color, startX, startY, isP1) {
    this.color = color;
    this.isP1 = isP1;
    this.x = startX;
    this.y = startY;
    this.dx = 0;
    this.dy = 0;
    this.grounded = false;
    this.facing = isP1 ? 1 : -1;
    this.health = 100;
    this.lastShotTime = 0;
    this.weaponClass = null;
  }

  reset(startX, startY) {
    this.x = startX; this.y = startY;
    this.dx = 0; this.dy = 0;
    this.grounded = false;
    this.facing = this.isP1 ? 1 : -1;
    this.health = 100;
    this.lastShotTime = 0;
  }

  update(now, projectiles) {
    if (this.isP1) {
      if (keys.a) { this.dx = -MOVE_SPEED; this.facing = -1; }
      if (keys.d) { this.dx = MOVE_SPEED; this.facing = 1; }
    } else {
      if (keys.ArrowLeft) { this.dx = -MOVE_SPEED; this.facing = -1; }
      if (keys.ArrowRight) { this.dx = MOVE_SPEED; this.facing = 1; }
    }

    this.dx *= FRICTION;
    this.x += this.dx;
    this.dy += GRAVITY;
    this.y += this.dy;

    const jumpKey = this.isP1 ? keys.w : keys.ArrowUp;
    if (jumpKey && this.grounded) {
      this.dy = JUMP_STRENGTH;
      this.grounded = false;
    }

    let landed = false;
    for (const [left, right, top, bottom] of PLATFORMS) {
      if (left - 10 < this.x && this.x < right + 10) {
        if (this.dy <= 0 && top >= this.y - 15 && this.y - 15 >= top + this.dy - 4) {
          this.y = top + 15;
          this.dy = 0;
          landed = true;
        }
      }
    }
    this.grounded = landed;

    this.x = Math.max(-435, Math.min(this.x, 435));
    if (this.y < -330) {
      this.y = -235;
      this.dy = 0;
      this.grounded = true;
    }

    const shootKey = this.isP1 ? keys.s : keys.ArrowDown;
    if (shootKey && this.weaponClass) {
      const cooldown = WEAPONS[this.weaponClass].cooldown;
      if (now - this.lastShotTime >= cooldown) {
        this.lastShotTime = now;
        if (this.weaponClass === "regular") {
          projectiles.push(new Projectile(this, 13, 1.5, -0.08, 12, 700));
        } else {
          for (const spread of [-3.0, -1.0, 1.0, 3.0]) {
            projectiles.push(new Projectile(this, 9, spread, -0.4, 8, 240));
          }
        }
      }
    }
  }

  draw() {
    const cx = toSX(this.x), cy = toSY(this.y);
    const f = this.facing;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 6;

    // head
    ctx.beginPath();
    ctx.arc(cx, cy - 10, 6, 0, Math.PI * 2);
    ctx.stroke();

    // torso
    line(cx, cy - 10, cx, cy + 5);
    // back arm
    line(cx, cy - 5, cx - f * 6, cy - 2);
    // forward gun arm
    const gunLength = this.weaponClass === "pump" ? 16 : 12;
    line(cx, cy - 5, cx + f * 8, cy - 5);
    line(cx + f * 8, cy - 5, cx + f * (8 + gunLength), cy - 5);
    // legs
    line(cx, cy + 5, cx - f * 5, cy + 15);
    line(cx, cy + 5, cx + f * 5, cy + 15);

    ctx.shadowBlur = 0;
  }
}

function line(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

class Projectile {
  constructor(owner, speedX, launchY, grav, damage, maxDist) {
    this.owner = owner;
    this.color = owner.color;
    this.startX = owner.x;
    this.x = owner.x + owner.facing * 15;
    this.y = owner.y + 5;
    this.dx = owner.facing * speedX;
    this.dy = launchY;
    this.grav = grav;
    this.damage = damage;
    this.maxDist = maxDist;
  }

  update() {
    this.dy += this.grav;
    this.x += this.dx;
    this.y += this.dy;

    if (Math.abs(this.x - this.startX) > this.maxDist) return true;

    for (const [left, right, top, bottom] of PLATFORMS) {
      if (left <= this.x && this.x <= right && bottom <= this.y && this.y <= top) return true;
    }
    if (Math.abs(this.x) > 450 || this.y < -350) return true;
    return false;
  }

  draw() {
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(toSX(this.x), toSY(this.y), 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// --- STATE ---
let p1 = new Entity("#00FFFF", -250, -200, true);
let p2 = new Entity("#FF00FF", 250, -200, false);
let projectiles = [];
let state = "menu"; // 'menu' | 'playing' | 'gameover'
let winnerText = "";
let menuReadyAt = null;

function drawPlatforms() {
  ctx.fillStyle = "#39FF14";
  ctx.shadowColor = "#39FF14";
  ctx.shadowBlur = 4;
  for (const [left, right, top, bottom] of PLATFORMS) {
    const x = toSX(left);
    const y = toSY(top);
    const w = right - left;
    const h = toSY(bottom) - toSY(top);
    ctx.fillRect(x, y, w, h);
  }
  ctx.shadowBlur = 0;
}

function clearScreen() {
  ctx.fillStyle = "#121212";
  ctx.fillRect(0, 0, W, H);
}

function drawMenu() {
  clearScreen();
  drawPlatforms();

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px 'Space Mono', monospace";
  ctx.fillText("WEAPON CLASS SELECTION", W / 2, 90);

  ctx.font = "bold 14px 'Space Mono', monospace";
  ctx.fillStyle = "#ffffff";
  const p1x = W / 2 - 250, p2x = W / 2 + 250;

  drawMultiline(p1x, 150, [
    "PLAYER 1 (WASD)", "", "Press 1 — Regular Rifle", "Press 2 — Pump Shotgun",
  ]);
  drawMultiline(p2x, 150, [
    "PLAYER 2 (ARROWS)", "", "Press 7 — Regular Rifle", "Press 8 — Pump Shotgun",
  ]);

  ctx.font = "bold 15px 'Space Mono', monospace";
  if (p1.weaponClass) {
    ctx.fillStyle = "#00FFFF";
    ctx.fillText(`READY: ${WEAPONS[p1.weaponClass].label}`, p1x, 250);
  } else {
    ctx.fillStyle = "#ff5555";
    ctx.fillText("SELECTING...", p1x, 250);
  }
  if (p2.weaponClass) {
    ctx.fillStyle = "#FF00FF";
    ctx.fillText(`READY: ${WEAPONS[p2.weaponClass].label}`, p2x, 250);
  } else {
    ctx.fillStyle = "#ff5555";
    ctx.fillText("SELECTING...", p2x, 250);
  }
  ctx.textAlign = "left";

  if (keys[1]) p1.weaponClass = "regular";
  if (keys[2]) p1.weaponClass = "pump";
  if (keys[7]) p2.weaponClass = "regular";
  if (keys[8]) p2.weaponClass = "pump";

  if (p1.weaponClass && p2.weaponClass) {
    if (menuReadyAt === null) menuReadyAt = performance.now();
    if (performance.now() - menuReadyAt > 450) {
      startMatch();
    }
  } else {
    menuReadyAt = null;
  }
}

function drawMultiline(x, yStart, lines) {
  ctx.textAlign = "center";
  let y = yStart;
  for (const l of lines) {
    if (l !== "") ctx.fillText(l, x, y);
    y += 22;
  }
}

function startMatch() {
  p1.reset(-250, -200);
  p2.reset(250, -200);
  projectiles = [];
  state = "playing";
}

function barBg(x, y, w, h) {
  ctx.fillStyle = "#441111";
  ctx.fillRect(x, y, w, h);
}

function healthBar(x, y, health, color) {
  barBg(x, y, 150, 12);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, health) * 1.5, 12);
}

function reloadBar(x, y, ratio) {
  ctx.fillStyle = "#333333";
  ctx.fillRect(x, y, 100, 6);
  ctx.fillStyle = ratio < 1.0 ? "#ffa500" : "#ffff00";
  ctx.fillRect(x, y, ratio * 100, 6);
}

function drawHUD(now) {
  ctx.textAlign = "left";
  ctx.font = "bold 13px 'Space Mono', monospace";

  ctx.fillStyle = "#ffffff";
  ctx.fillText(`P1 HP: ${Math.max(0, Math.round(p1.health))} [${WEAPONS[p1.weaponClass].label}]`, 20, 35);
  healthBar(20, 45, p1.health, "#00FFFF");
  const p1Ratio = Math.min(1, (now - p1.lastShotTime) / WEAPONS[p1.weaponClass].cooldown);
  reloadBar(20, 65, p1Ratio);

  ctx.fillStyle = "#ffffff";
  ctx.fillText(`P2 HP: ${Math.max(0, Math.round(p2.health))} [${WEAPONS[p2.weaponClass].label}]`, W - 170, 35);
  healthBar(W - 170, 45, p2.health, "#FF00FF");
  const p2Ratio = Math.min(1, (now - p2.lastShotTime) / WEAPONS[p2.weaponClass].cooldown);
  reloadBar(W - 170, 65, p2Ratio);
}

function drawGameOver() {
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px 'Space Mono', monospace";
  ctx.fillText(winnerText, W / 2, H / 2 - 10);
  ctx.font = "14px 'Space Mono', monospace";
  ctx.fillStyle = "#9be89b";
  ctx.fillText("Press R for a rematch", W / 2, H / 2 + 26);
  ctx.textAlign = "left";
}

function step(now) {
  if (state === "playing") {
    p1.update(now / 1000, projectiles);
    p2.update(now / 1000, projectiles);

    const survivors = [];
    for (const proj of projectiles) {
      const destroyed = proj.update();
      let hit = destroyed;
      const target = proj.owner === p1 ? p2 : p1;
      if (
        !hit &&
        target.x - 15 < proj.x && proj.x < target.x + 15 &&
        target.y - 20 < proj.y && proj.y < target.y + 15
      ) {
        target.health -= proj.damage;
        hit = true;
      }
      if (!hit) survivors.push(proj);
    }
    projectiles = survivors;

    clearScreen();
    drawPlatforms();
    for (const proj of projectiles) proj.draw();
    p1.draw();
    p2.draw();
    drawHUD(now / 1000);

    if (p1.health <= 0 || p2.health <= 0) {
      if (p1.health <= 0 && p2.health <= 0) winnerText = "DRAW / MUTUAL K.O.";
      else if (p1.health <= 0) winnerText = "PLAYER 2 WINS!";
      else winnerText = "PLAYER 1 WINS!";
      state = "gameover";
    }
  } else if (state === "menu") {
    drawMenu();
  } else if (state === "gameover") {
    drawHUD(now / 1000);
    drawGameOver();
    if (keys.r) {
      p1.weaponClass = null;
      p2.weaponClass = null;
      menuReadyAt = null;
      state = "menu";
    }
  }

  requestAnimationFrame(step);
}

requestAnimationFrame(step);
