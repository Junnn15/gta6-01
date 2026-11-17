// SOLMAR HEAT — hud.js
// One clear job: everything drawn on top of the 3D view. The DOM HUD
// (health, money, wanted stars, ammo, speed, objective, messages, menus)
// and the live 2D minimap (city grid, player arrow, police, mission
// marker, traffic) drawn on a small canvas.

import { CITY_HALF, WORLD_HALF, MISSIONS, DEBT_TOTAL } from './config.js';

export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.healthFill = document.getElementById('health-fill');
    this.healthText = document.getElementById('health-text');
    this.moneyText = document.getElementById('money');
    this.debtText = document.getElementById('debt');
    this.starsEl = document.getElementById('stars');
    this.ammoText = document.getElementById('ammo');
    this.speedText = document.getElementById('speed');
    this.objectiveText = document.getElementById('objective');
    this.messageEl = document.getElementById('message');
    this.messageTitle = document.getElementById('message-title');
    this.messageBody = document.getElementById('message-body');
    this.crosshair = document.getElementById('crosshair');
    this.interactEl = document.getElementById('interact');
    this.minimap = document.getElementById('minimap');
    this.mapCtx = this.minimap.getContext('2d');
    this.menu = document.getElementById('menu');
    this.menuTitle = document.getElementById('menu-title');
    this.menuBody = document.getElementById('menu-body');
    this.menuHint = document.getElementById('menu-hint');
    this.bustedTimer = document.getElementById('busted-timer');
    this._lastMessage = '';
  }

  show() {
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
  }

  update(state) {
    // state: {health, money, debt, stars, ammo, reserve, reloading, speed,
    // inCar, objective, message, messageTimer, interact, bustProgress}
    const hp = Math.max(0, Math.round(state.health));
    this.healthFill.style.width = `${hp}%`;
    this.healthFill.style.background = hp > 50 ? '#4caf50' : hp > 25 ? '#ff9800' : '#f44336';
    this.healthText.textContent = `${hp}`;
    this.moneyText.textContent = `$${state.money.toLocaleString('en-US')}`;
    this.debtText.textContent = `Debt: $${state.debt.toLocaleString('en-US')} / $${DEBT_TOTAL.toLocaleString('en-US')}`;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < state.stars ? '★' : '☆';
    this.starsEl.textContent = stars;
    this.starsEl.classList.toggle('hot', state.stars > 0);
    this.ammoText.textContent = state.reloading
      ? 'RELOADING…'
      : `AMMO ${state.ammo} / ${state.reserve}`;
    this.speedText.textContent = state.inCar ? `${Math.round(Math.abs(state.speed) * 3.6)} km/h` : '';
    this.objectiveText.textContent = state.objective;
    this.crosshair.style.display = state.inCar ? 'none' : 'block';
    if (state.interact) {
      this.interactEl.textContent = state.interact;
      this.interactEl.classList.remove('hidden');
    } else {
      this.interactEl.classList.add('hidden');
    }
    if (state.message && state.messageTimer > 0) {
      if (state.message !== this._lastMessage) {
        const [title, ...rest] = state.message.split('\n');
        this.messageTitle.textContent = title;
        this.messageBody.textContent = rest.join(' ');
        this._lastMessage = state.message;
      }
      this.messageEl.classList.remove('hidden');
    } else {
      this.messageEl.classList.add('hidden');
      this._lastMessage = '';
    }
    if (state.bustProgress > 0) {
      this.bustedTimer.textContent = `BUSTED IN ${Math.max(0, 1.2 - state.bustProgress).toFixed(1)}s — RUN!`;
      this.bustedTimer.classList.remove('hidden');
    } else {
      this.bustedTimer.classList.add('hidden');
    }
  }

  // Live minimap: 170x170 canvas over the whole world square.
  drawMinimap(state) {
    // state: {playerX, playerZ, playerHeading, policeCars, officers,
    // trafficCars, missionX, missionZ, missionVisible, guards}
    const ctx = this.mapCtx;
    const S = 170;
    const half = WORLD_HALF + 10;
    const toMap = (x, z) => [((x + half) / (half * 2)) * S, ((z + half) / (half * 2)) * S];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(10, 26, 18, 0.85)';
    ctx.fillRect(0, 0, S, S);
    // Sea and beach.
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(0, ((196 + half) / (half * 2)) * S, S, S);
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(0, ((178 + half) / (half * 2)) * S, S, ((196 - 178) / (half * 2)) * S);
    // City blocks.
    ctx.fillStyle = '#5a6252';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#3a3f46';
    const roadW = (10 / (half * 2)) * S;
    for (const line of [-150, -100, -50, 0, 50, 100, 150]) {
      const [px] = toMap(line, 0);
      const [, pz] = toMap(0, line);
      ctx.fillRect(px - roadW / 2, 0, roadW, S);
      ctx.fillRect(0, pz - roadW / 2, S, roadW);
    }
    // Plaza.
    const [plazaX, plazaZ] = toMap(0, 0);
    ctx.fillStyle = '#cfc4ae';
    ctx.fillRect(plazaX - 14, plazaZ - 14, 28, 28);
    // Mission marker (pulsing yellow diamond).
    if (state.missionVisible && state.missionX !== null) {
      const [mx, mz] = toMap(state.missionX, state.missionZ);
      const pulse = 5 + Math.sin(performance.now() * 0.006) * 2;
      ctx.fillStyle = '#ffc832';
      ctx.beginPath();
      ctx.moveTo(mx, mz - pulse - 3);
      ctx.lineTo(mx + pulse, mz);
      ctx.lineTo(mx, mz + pulse + 3);
      ctx.lineTo(mx - pulse, mz);
      ctx.closePath();
      ctx.fill();
    }
    // Traffic (grey dots), guards (orange), police (red), officers (red ring).
    ctx.fillStyle = '#c8c8c8';
    for (const c of state.trafficCars) {
      const [x, z] = toMap(c.x, c.z);
      ctx.fillRect(x - 1.5, z - 1.5, 3, 3);
    }
    ctx.fillStyle = '#ff7a2a';
    for (const g of state.guards) {
      const [x, z] = toMap(g.x, g.z);
      ctx.fillRect(x - 2, z - 2, 4, 4);
    }
    ctx.fillStyle = '#ff2a2a';
    for (const c of state.policeCars) {
      const [x, z] = toMap(c.x, c.z);
      ctx.beginPath();
      ctx.arc(x, z, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#ff2a2a';
    ctx.lineWidth = 2;
    for (const o of state.officers) {
      const [x, z] = toMap(o.x, o.z);
      ctx.beginPath();
      ctx.arc(x, z, 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Player arrow.
    const [px, pz] = toMap(state.playerX, state.playerZ);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(state.playerHeading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    void MISSIONS;
    void CITY_HALF;
  }

  showMenu(kind, data = {}) {
    this.menu.classList.remove('hidden');
    this.hide();
    if (kind === 'start') {
      this.menuTitle.textContent = 'SOLMAR HEAT';
      this.menuBody.innerHTML =
        'Dario Cruz owes the Bay Crew <b>$8,000</b>. Fixer Marta Reyes has four jobs that buy his freedom.<br><br>' +
        '<b>WASD</b> move &nbsp; <b>Mouse</b> look &nbsp; <b>Shift</b> run<br>' +
        '<b>E</b> steal / exit car &nbsp; <b>Click</b> shoot &nbsp; <b>R</b> reload<br>' +
        '<b>P</b> pause &nbsp; <b>M</b> mute &nbsp; progress saves automatically.<br><br>' +
        'Steal cars. Lose the cops. Pay the debt.';
      this.menuHint.textContent = 'Click or press ENTER to start';
    } else if (kind === 'pause') {
      this.menuTitle.textContent = 'PAUSED';
      this.menuBody.innerHTML = `Money <b>$${data.money}</b> &nbsp; Debt left <b>$${data.debt}</b><br>Mission ${data.mission} of 4`;
      this.menuHint.textContent = 'Press P or click to resume';
    } else if (kind === 'busted') {
      this.menuTitle.textContent = 'BUSTED';
      this.menuBody.innerHTML = 'The Solmar PD caught up with Dario.<br>You lose <b>$200</b> bail. The debt is still waiting.';
      this.menuHint.textContent = 'Click or press ENTER to get back out there';
    } else if (kind === 'wasted') {
      this.menuTitle.textContent = 'WASTED';
      this.menuBody.innerHTML = 'Dario went down in the streets of Solmar.<br>You lose <b>$200</b>. Marta still has work for you.';
      this.menuHint.textContent = 'Click or press ENTER to try again';
    } else if (kind === 'complete') {
      this.menuTitle.textContent = 'DEBT PAID';
      this.menuBody.innerHTML =
        'All four jobs done. <b>$8,000</b> to the Bay Crew — Dario Cruz is a free man.<br><br>' +
        'Solmar is yours now. Keep driving, keep the money.';
      this.menuHint.textContent = 'Click or press ENTER to keep playing';
    }
  }

  hideMenu() {
    this.menu.classList.add('hidden');
    this.show();
  }
}
