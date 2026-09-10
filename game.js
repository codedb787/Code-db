"use strict";


const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

function toSX(x) { return W / 2 + x; }
function toSY(y) { return H / 2 - y; }
function line(x1, y1, x2, y2) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

// --- PHYSICS ---
const GRAVITY = -0.45;
const JUMP_STRENGTH = 11.5;
const MOVE_SPEED = 6.2;
const FRICTION = 0.85;

// --- MAPS: each platform is [left_x, right_x, top_y, bottom_y] ---
const MAPS = {
  arenaI: [
    [-450, 450, -250, -350],
    [-350, -150, -150, -170],
    [-50, 150, -150, -170],
    [250, 400, -150, -170],
    [-420, -250, -50, -70],
    [-100, 100, -50, -70],
    [150, 320, -50, -70],
    [-300, -100, 50, 30],
    [-120, 120, 150, 130],
  ],
  arenaII: [
    [-450, 450, -250, -350],
    [-420, -280, -180, -200],
    [-140, 140, -140, -160],
    [280, 420, -180, -200],
    [-380, -220, -40, -60],
    [220, 380, -40, -60],
    [-60, 60, 60, 40],
    [-320, -180, 160, 140],
    [180, 320, 160, 140],
  ],
  arenaIII: [
    [-450, 450, -250, -350],
    [-400, -200, -160, -180],
    [200, 400, -160, -180],
    [-460, -320, -60, -80],
    [320, 460, -60, -80],
    [-90, 90, -60, -80],
    [-150, 150, 60, 40],
    [-420, -300, 180, 160],
    [300, 420, 180, 160],
  ],
};

function randomMap() {
  const plats = [[-450, 450, -250, -350]];
  const tiers = [-170, -70, 30, 130];
  for (const top of tiers) {
    const count = 2 + Math.floor(Math.random() * 2);
    const used = [];
    for (let i = 0; i < count; i++) {
      let tries = 0;
      while (tries < 20) {
        const width = 120 + Math.random() * 130;
        const left = -420 + Math.random() * (840 - width);
        const right = left + width;
        const overlaps = used.some(([l, r]) => !(right < l - 30 || left > r + 30));
        if (!overlaps) { used.push([left, right]); plats.push([left, right, top, top - 20]); break; }
        tries++;
      }
    }
  }
  return plats;
}

function buildPlatforms(mapKey) {
  if (mapKey === "random") return randomMap();
  return (MAPS[mapKey] || MAPS.arenaI).map((p) => p.slice());
}

let PLATFORMS = buildPlatforms("arenaI");

// --- INPUT ---
const keys = {
  a: false, d: false, w: false, s: false,
  ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false,
  1: false, 2: false, 3: false, 4: false,
  7: false, 8: false, 9: false, 0: false,
  r: false,
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
  smg: { cooldown: 0.28, label: "SMG" },
  sniper: { cooldown: 2.8, label: "SNIPER" },
};

function fireWeapon(entity, weaponKey, projectiles) {
  const x = entity.x + entity.facing * 15, y = entity.y + 5;
  switch (weaponKey) {
    case "regular":
      projectiles.push(new Projectile(x, y, entity.facing * 13, 1.5, -0.08, 12, 700, entity.color, x, entity));
      break;
    case "pump":
      for (const s of [-3.0, -1.0, 1.0, 3.0]) {
        projectiles.push(new Projectile(x, y, entity.facing * 9, s, -0.4, 8, 240, entity.color, x, entity));
      }
      break;
    case "smg":
      projectiles.push(new Projectile(x, y, entity.facing * 15, (Math.random() - 0.5) * 1.4, -0.05, 4, 480, entity.color, x, entity));
      break;
    case "sniper":
      projectiles.push(new Projectile(x, y, entity.facing * 24, 0, -0.015, 30, 900, entity.color, x, entity));
      break;
  }
}

// --- BOSS DIFFICULTY ---
const DIFFICULTY = {
  easy: { health: 150, moveMult: 0.75, fireCooldown: 2.6, aimError: 55, specialCooldown: 9.0, dmgMult: 0.85 },
  normal: { health: 220, moveMult: 0.95, fireCooldown: 2.0, aimError: 32, specialCooldown: 7.0, dmgMult: 1.0 },
  hard: { health: 300, moveMult: 1.15, fireCooldown: 1.5, aimError: 16, specialCooldown: 5.5, dmgMult: 1.15 },
  nightmare: { health: 420, moveMult: 1.35, fireCooldown: 1.05, aimError: 6, specialCooldown: 4.0, dmgMult: 1.3 },
};

class Entity {
  constructor(color, startX, startY, isP1) {
    this.color = color;
    this.isP1 = isP1;
    this.x = startX; this.y = startY;
    this.dx = 0; this.dy = 0;
    this.grounded = false;
    this.facing = isP1 ? 1 : -1;
    this.health = 100; this.maxHealth = 100;
    this.lastShotTime = 0;
    this.weaponClass = null;
    this.team = isP1 ? "p1" : "p2";
    this.hbX = 15; this.hbTop = 15; this.hbBottom = 20;
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
    if (jumpKey && this.grounded) { this.dy = JUMP_STRENGTH; this.grounded = false; }

    let landed = false;
    for (const [left, right, top] of PLATFORMS) {
      if (left - 10 < this.x && this.x < right + 10) {
        if (this.dy <= 0 && top >= this.y - 15 && this.y - 15 >= top + this.dy - 4) {
          this.y = top + 15; this.dy = 0; landed = true;
        }
      }
    }
    this.grounded = landed;

    this.x = Math.max(-435, Math.min(this.x, 435));
    if (this.y < -330) { this.y = -235; this.dy = 0; this.grounded = true; }

    const shootKey = this.isP1 ? keys.s : keys.ArrowDown;
    if (shootKey && this.weaponClass) {
      const cooldown = WEAPONS[this.weaponClass].cooldown;
      if (now - this.lastShotTime >= cooldown) {
        this.lastShotTime = now;
        fireWeapon(this, this.weaponClass, projectiles);
      }
    }
  }

  draw(scale = 1) {
    const cx = toSX(this.x), cy = toSY(this.y);
    const f = this.facing;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3 * Math.max(1, scale * 0.85);
    ctx.lineCap = "round";
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 6;

    ctx.beginPath();
    ctx.arc(cx, cy - 10 * scale, 6 * scale, 0, Math.PI * 2);
    ctx.stroke();

    line(cx, cy - 10 * scale, cx, cy + 5 * scale);
    line(cx, cy - 5 * scale, cx - f * 6 * scale, cy - 2 * scale);

    const gunLength = (this.weaponClass === "pump" ? 16 : this.weaponClass === "sniper" ? 20 : this.weaponClass === "smg" ? 10 : 12) * scale;
    line(cx, cy - 5 * scale, cx + f * 8 * scale, cy - 5 * scale);
    line(cx + f * 8 * scale, cy - 5 * scale, cx + f * (8 * scale + gunLength), cy - 5 * scale);

    line(cx, cy + 5 * scale, cx - f * 5 * scale, cy + 15 * scale);
    line(cx, cy + 5 * scale, cx + f * 5 * scale, cy + 15 * scale);

    ctx.shadowBlur = 0;
  }
}

class Boss extends Entity {
  constructor(x, y, cfg) {
    super("#ff3300", x, y, false);
    this.isBoss = true;
    this.team = "boss";
    this.scale = 2.1;
    this.hbX = 32; this.hbTop = 32; this.hbBottom = 44;
    this.cfg = cfg;
    this.maxHealth = cfg.health;
    this.health = cfg.health;
    this.fireTimer = cfg.fireCooldown * 0.5;
    this.specialTimer = cfg.specialCooldown * 0.6;
    this.preferredRange = 260;
    this.jumpChance = 0.015 + (cfg.moveMult - 0.75) * 0.025;
    this.slamming = false;
  }

  aiUpdate(dtSec, targets, projectiles, effects) {
    const living = targets.filter((t) => t.health > 0);
    if (living.length === 0) return;

    let target = living[0], best = Infinity;
    for (const t of living) {
      const d = Math.abs(t.x - this.x);
      if (d < best) { best = d; target = t; }
    }

    const dist = target.x - this.x;
    const absDist = Math.abs(dist);
    let dir = 0;
    if (absDist > this.preferredRange + 40) dir = Math.sign(dist);
    else if (absDist < this.preferredRange - 80) dir = -Math.sign(dist);
    else if (Math.random() < 0.015) dir = Math.random() < 0.5 ? -1 : 1;

    if (dir !== 0) { this.dx = dir * MOVE_SPEED * this.cfg.moveMult; this.facing = dir; }
    else this.dx *= FRICTION;

    this.x += this.dx;
    this.dy += GRAVITY;
    this.y += this.dy;

    if (this.grounded && !this.slamming && (target.y > this.y + 40 || Math.random() < this.jumpChance)) {
      this.dy = JUMP_STRENGTH * 1.05;
      this.grounded = false;
    }

    let landed = false;
    for (const [left, right, top] of PLATFORMS) {
      if (left - 10 < this.x && this.x < right + 10) {
        if (this.dy <= 0 && top >= this.y - 15 && this.y - 15 >= top + this.dy - 4) {
          this.y = top + 15; this.dy = 0; landed = true;
        }
      }
    }
    const wasAirborne = !this.grounded;
    this.grounded = landed;
    this.x = Math.max(-435, Math.min(this.x, 435));
    if (this.y < -330) { this.y = -235; this.dy = 0; this.grounded = true; }

    if (this.slamming && this.grounded && wasAirborne) {
      this.slamming = false;
      effects.push({ x: this.x, y: this.y - 15, maxR: 170, t: 0, maxT: 0.4 });
      for (const t of living) {
        if (Math.abs(t.x - this.x) < 170 && Math.abs(t.y - this.y) < 90) {
          t.health -= Math.round(22 * this.cfg.dmgMult);
        }
      }
    }

    this.fireTimer -= dtSec;
    this.specialTimer -= dtSec;

    if (this.specialTimer <= 0 && this.grounded && !this.slamming) {
      this.specialTimer = this.cfg.specialCooldown;
      if (Math.random() < 0.5) this.barrageAt(target, projectiles);
      else { this.dy = JUMP_STRENGTH * 1.35; this.grounded = false; this.slamming = true; }
    } else if (this.fireTimer <= 0) {
      this.fireTimer = this.cfg.fireCooldown;
      this.shootAt(target, projectiles);
    }
  }

  shootAt(target, projectiles) {
    const x = this.x + this.facing * 22, y = this.y + 8;
    const leadX = target.x + target.dx * 8;
    const angle = Math.atan2(target.y - this.y, leadX - this.x);
    const err = (Math.random() - 0.5) * (this.cfg.aimError * Math.PI / 180);
    const a = angle + err;
    const speed = 12.5;
    projectiles.push(new Projectile(x, y, Math.cos(a) * speed, Math.sin(a) * speed, -0.08, Math.round(14 * this.cfg.dmgMult), 900, this.color, x, this));
  }

  barrageAt(target, projectiles) {
    const x = this.x + this.facing * 22, y = this.y + 8;
    const baseAngle = Math.atan2(target.y - this.y, target.x - this.x);
    for (const d of [-24, -12, 0, 12, 24]) {
      const a = baseAngle + d * Math.PI / 180;
      projectiles.push(new Projectile(x, y, Math.cos(a) * 11, Math.sin(a) * 11, -0.1, Math.round(9 * this.cfg.dmgMult), 520, this.color, x, this));
    }
  }
}

class Projectile {
  constructor(x, y, dx, dy, grav, damage, maxDist, color, startX, owner) {
    this.x = x; this.y = y; this.dx = dx; this.dy = dy;
    this.grav = grav; this.damage = damage; this.maxDist = maxDist;
    this.color = color; this.startX = startX; this.owner = owner;
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

function projectileHits(proj, ent) {
  return (
    ent.x - ent.hbX < proj.x && proj.x < ent.x + ent.hbX &&
    ent.y - ent.hbBottom < proj.y && proj.y < ent.y + ent.hbTop
  );
}

// --- SETTINGS / SETUP PANEL ---
const settings = { mode: "pvp", players: "1", difficulty: "normal", map: "arenaI" };

document.querySelectorAll(".seg").forEach((seg) => {
  const group = seg.dataset.group;
  seg.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      seg.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      settings[group] = btn.dataset.value;
      if (group === "mode") {
        const isBoss = settings.mode === "boss";
        document.getElementById("playersRow").hidden = !isBoss;
        document.getElementById("difficultyRow").hidden = !isBoss;
      }
      if (group === "map") PLATFORMS = buildPlatforms(settings.map);
    });
  });
});

document.getElementById("startBtn").addEventListener("click", () => {
  document.getElementById("setupPanel").style.display = "none";
  beginClassSelect();
});

document.getElementById("settingsBtn").addEventListener("click", () => {
  document.getElementById("setupPanel").style.display = "flex";
  state = "setup";
});

function isP2Active() {
  return settings.mode === "pvp" || (settings.mode === "boss" && settings.players === "2");
}

// --- GAME STATE ---
let p1 = new Entity("#00FFFF", -250, -200, true);
let p2 = new Entity("#FF00FF", 250, -200, false);
let boss = null;
let projectiles = [];
let effects = [];
let state = "setup"; // 'setup' | 'classSelect' | 'playing' | 'gameover'
let winnerText = "";
let menuReadyAt = null;

function beginClassSelect() {
  p1.weaponClass = null;
  if (isP2Active()) p2.weaponClass = null;
  menuReadyAt = null;
  state = "classSelect";
}

function clearScreen() {
  ctx.fillStyle = "#121212";
  ctx.fillRect(0, 0, W, H);
}

function drawPlatforms() {
  ctx.fillStyle = "#39FF14";
  ctx.shadowColor = "#39FF14";
  ctx.shadowBlur = 4;
  for (const [left, right, top, bottom] of PLATFORMS) {
    ctx.fillRect(toSX(left), toSY(top), right - left, toSY(bottom) - toSY(top));
  }
  ctx.shadowBlur = 0;
}

function drawWeaponPanel(x, entity, lines, label, color) {
  ctx.textAlign = "center";
  ctx.font = "bold 13px 'Space Mono', monospace";
  ctx.fillStyle = "#ffffff";
  let y = 140;
  ctx.fillText(label, x, y); y += 26;
  for (const l of lines) { ctx.fillText(l, x, y); y += 20; }
  y += 10;
  ctx.font = "bold 15px 'Space Mono', monospace";
  if (entity.weaponClass) {
    ctx.fillStyle = color;
    ctx.fillText(`READY: ${WEAPONS[entity.weaponClass].label}`, x, y);
  } else {
    ctx.fillStyle = "#ff5555";
    ctx.fillText("SELECTING...", x, y);
  }
}

function drawClassSelect() {
  clearScreen();
  drawPlatforms();

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px 'Space Mono', monospace";
  ctx.fillText(settings.mode === "boss" ? "PREPARE FOR THE BOSS" : "WEAPON CLASS SELECTION", W / 2, 80);

  const p2Active = isP2Active();
  const p1x = p2Active ? W / 2 - 250 : W / 2;

  drawWeaponPanel(p1x, p1, ["1 — Regular", "2 — Pump", "3 — SMG", "4 — Sniper"], "PLAYER 1 (WASD)", "#00FFFF");

  if (p2Active) {
    drawWeaponPanel(W / 2 + 250, p2, ["7 — Regular", "8 — Pump", "9 — SMG", "0 — Sniper"], "PLAYER 2 (ARROWS)", "#FF00FF");
  } else if (settings.mode === "boss") {
    ctx.fillStyle = "#ff8866";
    ctx.font = "bold 13px 'Space Mono', monospace";
    ctx.fillText(`SOLO RUN — ${settings.difficulty.toUpperCase()} CPU BOSS WILL SPAWN`, W / 2, 230);
  }
  ctx.textAlign = "left";

  if (keys[1]) p1.weaponClass = "regular";
  if (keys[2]) p1.weaponClass = "pump";
  if (keys[3]) p1.weaponClass = "smg";
  if (keys[4]) p1.weaponClass = "sniper";
  if (p2Active) {
    if (keys[7]) p2.weaponClass = "regular";
    if (keys[8]) p2.weaponClass = "pump";
    if (keys[9]) p2.weaponClass = "smg";
    if (keys[0]) p2.weaponClass = "sniper";
  }

  const ready = p1.weaponClass && (!p2Active || p2.weaponClass);
  if (ready) {
    if (menuReadyAt === null) menuReadyAt = performance.now();
    if (performance.now() - menuReadyAt > 450) startMatch();
  } else {
    menuReadyAt = null;
  }
}

function startMatch() {
  PLATFORMS = buildPlatforms(settings.map);
  p1.reset(-250, -200);
  p1.team = settings.mode === "boss" ? "players" : "p1";
  if (isP2Active()) {
    p2.reset(250, -200);
    p2.team = settings.mode === "boss" ? "players" : "p2";
  }
  projectiles = [];
  effects = [];
  boss = null;
  if (settings.mode === "boss") {
    boss = new Boss(0, -150, DIFFICULTY[settings.difficulty]);
  }
  state = "playing";
}

function healthBar(x, y, health, maxHealth, color, width = 150, height = 12) {
  ctx.fillStyle = "#441111";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, health / maxHealth) * width, height);
}

function reloadBar(x, y, ratio) {
  ctx.fillStyle = "#333333";
  ctx.fillRect(x, y, 100, 6);
  ctx.fillStyle = ratio < 1.0 ? "#ffa500" : "#ffff00";
  ctx.fillRect(x, y, Math.max(0, ratio) * 100, 6);
}

function drawHUD(nowSec) {
  ctx.textAlign = "left";
  ctx.font = "bold 13px 'Space Mono', monospace";

  ctx.fillStyle = "#ffffff";
  ctx.fillText(`P1 HP: ${Math.max(0, Math.round(p1.health))} [${WEAPONS[p1.weaponClass].label}]`, 20, 35);
  healthBar(20, 45, p1.health, p1.maxHealth, "#00FFFF");
  reloadBar(20, 65, (nowSec - p1.lastShotTime) / WEAPONS[p1.weaponClass].cooldown);

  if (isP2Active()) {
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`P2 HP: ${Math.max(0, Math.round(p2.health))} [${WEAPONS[p2.weaponClass].label}]`, W - 190, 35);
    healthBar(W - 190, 45, p2.health, p2.maxHealth, "#FF00FF");
    reloadBar(W - 190, 65, (nowSec - p2.lastShotTime) / WEAPONS[p2.weaponClass].cooldown);
  }

  if (boss) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff6644";
    ctx.font = "bold 15px 'Space Mono', monospace";
    ctx.fillText(`BOSS — ${settings.difficulty.toUpperCase()}`, W / 2, 30);
    healthBar(W / 2 - 150, 38, boss.health, boss.maxHealth, "#ff3300", 300, 14);
    ctx.textAlign = "left";
  }
}

function drawShockwave(fx) {
  const p = fx.t / fx.maxT;
  ctx.strokeStyle = `rgba(255,90,0,${Math.max(0, 1 - p)})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(toSX(fx.x), toSY(fx.y), fx.maxR * p, 0, Math.PI * 2);
  ctx.stroke();
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

function playFrame(nowSec, dtSec) {
  const p2Active = isP2Active();
  p1.update(nowSec, projectiles);
  if (p2Active) p2.update(nowSec, projectiles);
  if (boss) boss.aiUpdate(dtSec, [p1, ...(p2Active ? [p2] : [])], projectiles, effects);

  const activeEntities = [p1, ...(p2Active ? [p2] : []), ...(boss ? [boss] : [])];
  const survivors = [];
  for (const proj of projectiles) {
    let destroyed = proj.update();
    if (!destroyed) {
      for (const ent of activeEntities) {
        if (ent === proj.owner || ent.team === proj.owner.team || ent.health <= 0) continue;
        if (projectileHits(proj, ent)) { ent.health -= proj.damage; destroyed = true; break; }
      }
    }
    if (!destroyed) survivors.push(proj);
  }
  projectiles = survivors;

  for (const fx of effects) fx.t += dtSec;
  effects = effects.filter((fx) => fx.t < fx.maxT);

  clearScreen();
  drawPlatforms();
  for (const proj of projectiles) proj.draw();
  for (const fx of effects) drawShockwave(fx);
  p1.draw();
  if (p2Active) p2.draw();
  if (boss) boss.draw(boss.scale);
  drawHUD(nowSec);

  if (settings.mode === "boss") {
    const playersAlive = p1.health > 0 || (p2Active && p2.health > 0);
    if (boss.health <= 0) { winnerText = "BOSS DEFEATED!"; state = "gameover"; }
    else if (!playersAlive) { winnerText = "THE BOSS WINS"; state = "gameover"; }
  } else {
    if (p1.health <= 0 || p2.health <= 0) {
      if (p1.health <= 0 && p2.health <= 0) winnerText = "DRAW / MUTUAL K.O.";
      else if (p1.health <= 0) winnerText = "PLAYER 2 WINS!";
      else winnerText = "PLAYER 1 WINS!";
      state = "gameover";
    }
  }
}

let lastFrameTime = null;
function step(nowMs) {
  if (lastFrameTime === null) lastFrameTime = nowMs;
  const dtSec = Math.min(0.05, (nowMs - lastFrameTime) / 1000);
  lastFrameTime = nowMs;
  const nowSec = nowMs / 1000;

  if (state === "setup") {
    clearScreen();
    drawPlatforms();
  } else if (state === "classSelect") {
    drawClassSelect();
  } else if (state === "playing") {
    playFrame(nowSec, dtSec);
  } else if (state === "gameover") {
    drawHUD(nowSec);
    drawGameOver();
    if (keys.r) startMatch();
  }

  requestAnimationFrame(step);
}

requestAnimationFrame(step);
