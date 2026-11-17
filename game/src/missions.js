// SOLMAR HEAT — missions.js
// One clear job: the story. Four jobs from fixer Marta Reyes that pay off
// Dario's $8,000 debt to the Bay Crew. A glowing beacon marks the current
// objective; each mission tracks its own progress and pays on completion.

import * as THREE from 'three';
import { MISSIONS, DEBT_TOTAL, dist2d, clamp } from './config.js';

export class MissionSystem {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.index = 0; // next mission to start (0..4); 4 = all done
    this.state = 'idle'; // idle | pickup | active | done
    this.timeLeft = 0;
    this.checkpointIndex = 0;
    this.guardsLeft = 0;
    this.vaultProgress = 0;
    this.message = '';
    this.messageTimer = 0;
    this.beacon = this._makeBeacon();
    this.scene.add(this.beacon);
    this.guards = [];
    this.pickedUp = false;
    this.targetCar = null; // mission 2: the red Comet GT
  }

  _makeBeacon() {
    const g = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffc832,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 60, 12, 1, true), beamMat);
    beam.position.y = 30;
    g.add(beam);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc832, transparent: true, opacity: 0.8 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3, 24), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    g.add(ring);
    g.userData.ring = ring;
    g.visible = false;
    return g;
  }

  get current() {
    return MISSIONS[this.index] || null;
  }

  get allDone() {
    return this.index >= MISSIONS.length;
  }

  get debtRemaining() {
    let paid = 0;
    for (let i = 0; i < this.index; i++) paid += MISSIONS[i].pay;
    return DEBT_TOTAL - paid;
  }

  get objectiveText() {
    if (this.allDone) return 'Debt paid. Solmar is yours, Dario.';
    const m = this.current;
    if (this.state === 'pickup') return `Go to the marker: ${m.name}`;
    if (this.state === 'active') {
      if (m.id === 'getaway') return `${m.objective} — ${this.checkpointIndex}/3 (${Math.ceil(this.timeLeft)}s)`;
      if (m.id === 'heist') {
        if (this.guardsLeft > 0) return `${m.objective} — guards left: ${this.guardsLeft}`;
        return `Hold the vault! ${Math.ceil(this.vaultProgress)}/${m.vaultHoldSeconds}s`;
      }
      return m.objective;
    }
    return 'Find Marta\'s next job';
  }

  start() {
    if (this.allDone) return;
    const m = this.current;
    this.state = 'pickup';
    this.pickedUp = false;
    this.showMessage(m.name, m.briefing, 7);
    this.audio?.missionStart();
    this._moveBeacon(m.pickup.x, m.pickup.z);
    if (m.id === 'heist') this._spawnGuards(m);
  }

  _spawnGuards(m) {
    this.guards = [];
    this.guardsLeft = m.guards.length;
    const guardMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc89878 });
    for (const gp of m.guards) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.0, 0.42), guardMat);
      body.position.y = 1.05;
      body.castShadow = true;
      g.add(body);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
      head.position.y = 1.8;
      g.add(head);
      const vest = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.46), new THREE.MeshLambertMaterial({ color: 0x8a2a2a }));
      vest.position.y = 1.15;
      g.add(vest);
      g.position.set(gp.x, 0, gp.z);
      this.scene.add(g);
      this.guards.push({ mesh: g, health: 100, x: gp.x, z: gp.z });
    }
  }

  _clearGuards() {
    for (const g of this.guards) this.scene.remove(g.mesh);
    this.guards = [];
  }

  showMessage(title, body, seconds = 4) {
    this.message = title ? `${title}\n${body}` : body;
    this.messageTimer = seconds;
  }

  _moveBeacon(x, z) {
    this.beacon.position.set(x, 0, z);
    this.beacon.visible = true;
  }

  _hideBeacon() {
    this.beacon.visible = false;
  }

  // Called every frame with the player's position and car state.
  // Returns 'completed' when a mission just paid out, else null.
  update(dt, playerPos, inCar, car) {
    if (this.messageTimer > 0) this.messageTimer -= dt;
    if (this.beacon.visible) {
      const ring = this.beacon.userData.ring;
      const s = 1 + Math.sin(performance.now() * 0.004) * 0.15;
      ring.scale.set(s, s, 1);
    }
    if (this.allDone || this.state === 'idle') return null;
    const m = this.current;

    if (this.state === 'pickup') {
      if (dist2d(playerPos.x, playerPos.z, m.pickup.x, m.pickup.z) < 4) {
        this.pickedUp = true;
        this.state = 'active';
        if (m.id === 'courier') {
          this.showMessage('', 'Package collected. Deliver it to the marina gate.', 4);
          this._moveBeacon(m.target.x, m.target.z);
        } else if (m.id === 'boost') {
          this.showMessage('', 'That is the Comet GT. Steal it — then take it to the garage.', 4);
          this._moveBeacon(m.target.x, m.target.z);
        } else if (m.id === 'getaway') {
          this.timeLeft = m.timeLimit;
          this.checkpointIndex = 0;
          this.showMessage('', 'Go! Hit all 3 checkpoints before the timer runs out.', 4);
          this._moveBeacon(m.checkpoints[0].x, m.checkpoints[0].z);
        } else if (m.id === 'heist') {
          this.showMessage('', 'Clear the guards, then hold the vault door.', 4);
          this._moveBeacon(m.target.x, m.target.z);
        }
        this.audio?.pickup();
      }
      return null;
    }

    // state === 'active'
    if (m.id === 'courier') {
      if (dist2d(playerPos.x, playerPos.z, m.target.x, m.target.z) < 5) {
        return this._complete();
      }
    } else if (m.id === 'boost') {
      if (inCar && car === this.targetCar && dist2d(playerPos.x, playerPos.z, m.target.x, m.target.z) < 6) {
        return this._complete();
      }
    } else if (m.id === 'getaway') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.showMessage('Getaway failed', 'Out of time. Marta is giving you one more shot — drive back to the start.', 5);
        this.state = 'pickup';
        this._moveBeacon(m.pickup.x, m.pickup.z);
        return null;
      }
      const cp = m.checkpoints[this.checkpointIndex];
      if (dist2d(playerPos.x, playerPos.z, cp.x, cp.z) < 6) {
        this.checkpointIndex += 1;
        this.audio?.checkpoint();
        if (this.checkpointIndex >= m.checkpoints.length) return this._complete();
        const next = m.checkpoints[this.checkpointIndex];
        this._moveBeacon(next.x, next.z);
        this.showMessage('', `Checkpoint ${this.checkpointIndex}/3 — next one marked.`, 3);
      }
    } else if (m.id === 'heist') {
      if (this.guardsLeft > 0) return null;
      if (dist2d(playerPos.x, playerPos.z, m.target.x, m.target.z) < 5) {
        this.vaultProgress += dt;
        if (this.vaultProgress >= m.vaultHoldSeconds) return this._complete();
      } else {
        this.vaultProgress = Math.max(0, this.vaultProgress - dt);
      }
    }
    return null;
  }

  _complete() {
    const m = this.current;
    this._clearGuards();
    this._hideBeacon();
    this.index += 1;
    this.state = 'idle';
    this.vaultProgress = 0;
    this.audio?.missionComplete();
    const debtLeft = this.debtRemaining;
    if (this.allDone) {
      this.showMessage('DEBT PAID', `All four jobs done. $${DEBT_TOTAL} to the Bay Crew — Dario is free.`, 8);
    } else {
      this.showMessage('Mission complete', `+$${m.pay} — debt left: $${debtLeft}. Next job is marked.`, 6);
    }
    return { mission: m, pay: m.pay, allDone: this.allDone };
  }

  // Guards hit by a bullet: returns the guard hit, or null.
  hitGuard(origin, dir, maxDist) {
    let best = null;
    let bd = maxDist;
    for (const g of this.guards) {
      const cx = g.mesh.position.x - origin.x;
      const cy = 1.2 - origin.y;
      const cz = g.mesh.position.z - origin.z;
      const t = cx * dir.x + cy * dir.y + cz * dir.z;
      if (t < 0 || t > bd) continue;
      const px = origin.x + dir.x * t;
      const py = origin.y + dir.y * t;
      const pz = origin.z + dir.z * t;
      const d = Math.hypot(px - g.mesh.position.x, py - 1.2, pz - g.mesh.position.z);
      if (d < 1.3) {
        bd = t;
        best = g;
      }
    }
    return best;
  }

  damageGuard(guard, dmg) {
    guard.health -= dmg;
    if (guard.health <= 0) {
      const i = this.guards.indexOf(guard);
      if (i >= 0) this.guards.splice(i, 1);
      this.scene.remove(guard.mesh);
      this.guardsLeft = this.guards.length;
      return true;
    }
    return false;
  }

  // Mission 2 needs its own red car parked by the north plaza.
  spawnTargetCar(makeCar) {
    const m = MISSIONS[1];
    this.targetCar = makeCar(m.pickup.x, m.pickup.z, 0, 0xd21f2b);
    return this.targetCar;
  }

  reset() {
    this._clearGuards();
    this._hideBeacon();
    this.index = 0;
    this.state = 'idle';
    this.timeLeft = 0;
    this.checkpointIndex = 0;
    this.guardsLeft = 0;
    this.vaultProgress = 0;
    this.message = '';
    this.messageTimer = 0;
  }
}

export { clamp };
