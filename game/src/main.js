// SOLMAR HEAT — main.js
// One clear job: the game itself. Owns the renderer, the third-person
// player (on foot and in cars), the camera, the frame loop and the glue
// between city, traffic, police, missions, combat, HUD, audio and saves.
// Everything the player does — walk, steal, drive, shoot, get busted —
// passes through here.

import * as THREE from 'three';
import {
  GAME_TITLE,
  PLAYER,
  COMBAT,
  WANTED,
  WORLD_HALF,
  CITY_HALF,
  COLORS,
  clamp,
  angleLerp,
  dist2d,
} from './config.js';
import { buildCity, resolveCollision } from './city.js';
import { Car } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { MissionSystem } from './missions.js';
import { Combat } from './combat.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { saveGame, loadGame } from './save.js';
import { parseShotParams, stageShot, installProbe } from './shots.js';

const SAVE_EVERY_SECONDS = 5;

class Game {
  constructor() {
    this.errorCount = 0;
    window.addEventListener('error', () => { this.errorCount += 1; });
    window.addEventListener('unhandledrejection', () => { this.errorCount += 1; });

    const params = parseShotParams();
    this.seed = params.seed;
    this.shotName = params.shot;

    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.sky);
    this.scene.fog = new THREE.Fog(COLORS.sky, 260, 560);

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

    // Sun + sky light.
    const sun = new THREE.DirectionalLight(COLORS.sun, 2.6);
    sun.position.set(160, 240, 90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -230;
    sun.shadow.camera.right = 230;
    sun.shadow.camera.top = 230;
    sun.shadow.camera.bottom = -230;
    sun.shadow.camera.far = 700;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.1));

    // Clouds: a few white blobs drifting slowly.
    this.clouds = [];
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(6 + j * 2, 8, 6), cloudMat);
        s.position.set(j * 7 - 10, j % 2, (j % 3) * 4 - 4);
        s.scale.y = 0.45;
        c.add(s);
      }
      c.position.set((Math.random() - 0.5) * 420, 95 + Math.random() * 40, (Math.random() - 0.5) * 420);
      this.clouds.push(c);
      this.scene.add(c);
    }

    const city = buildCity(this.scene, this.seed);
    this.city = city;
    this.colliders = city.colliders;

    this.audio = new AudioEngine();
    this.input = new Input(this.canvas);
    this.hud = new HUD();
    this.traffic = new Traffic(this.scene, this.colliders, this.seed);
    this.police = new Police(this.scene, this.colliders, this.seed);
    this.missions = new MissionSystem(this.scene, this.audio);
    this.combat = new Combat(this.scene, this.audio);

    // The red Comet GT for mission 2, parked by the north plaza.
    this.targetCar = this.missions.spawnTargetCar((x, z, heading, color) => {
      const car = new Car(this.scene, x, z, heading, color);
      return car;
    });

    // Guard tracer (red line when a guard shoots at Dario).
    const guardGeo = new THREE.BufferGeometry();
    guardGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.guardTracer = new THREE.Line(
      guardGeo,
      new THREE.LineBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.9 }),
    );
    this.guardTracer.visible = false;
    this.guardTracer.frustumCulled = false;
    this.scene.add(this.guardTracer);
    this.guardTracerTimer = 0;
    this.guardShootTimer = 0;

    // --- The player: Dario Cruz.
    this.player = this._makePlayerMesh();
    this.scene.add(this.player.mesh);
    this.player.health = PLAYER.healthMax;
    this.player.heading = 0;
    this.player.inCar = false;
    this.player.car = null;
    this.player.walkPhase = 0;
    this.parkedCars = [];

    this.cameraYaw = 0;
    this.cameraPitch = 0.32;
    this.lastMouseTime = -10;
    this.time = 0;

    this.state = 'menu';
    this.money = 0;
    this.saveTimer = 0;
    this.menuResumeState = 'playing';

    // Restore a previous session if one exists.
    const saved = loadGame();
    if (saved) {
      this.money = saved.money;
      this.missions.index = Math.min(saved.missionIndex, 4);
      this.player.health = saved.health;
      this.player.pos.set(saved.playerX, 0, saved.playerZ);
      this.player.heading = saved.playerHeading;
      this.cameraYaw = saved.playerHeading;
    } else {
      this.player.pos.set(0, 0, 30);
    }

    this.raycaster = new THREE.Raycaster();

    // Menus: click or Enter starts / resumes.
    document.getElementById('menu').addEventListener('click', () => this._menuAction());
    window.addEventListener('resize', () => this._onResize());
    this.hud.showMenu('start');
    installProbe(this);

    // Shot staging (screenshots / headless tests) runs after one frame
    // so the renderer exists and the scene is built.
    if (this.shotName) {
      requestAnimationFrame(() => {
        const ok = stageShot(this, this.shotName);
        window.__solmar.shotStaged = ok ? this.shotName : null;
        document.title = `${GAME_TITLE} — shot ${this.shotName}`;
      });
    }

    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  get playerPos() {
    return this.player.pos;
  }

  _makePlayerMesh() {
    const g = new THREE.Group();
    const jacket = new THREE.MeshLambertMaterial({ color: 0x2e6f8e });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd8a878 });
    const jeans = new THREE.MeshLambertMaterial({ color: 0x2c3a4a });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.45), jacket);
    body.position.y = 1.1;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), skin);
    head.position.y = 1.85;
    head.castShadow = true;
    g.add(head);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.16, 0.48), new THREE.MeshLambertMaterial({ color: 0x201510 }));
    hair.position.y = 2.1;
    g.add(hair);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.65, 0.28), jeans);
    legL.position.set(-0.18, 0.32, 0);
    g.add(legL);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.65, 0.28), jeans);
    legR.position.set(0.18, 0.32, 0);
    g.add(legR);
    // Pistol in the right hand, visible when on foot.
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.14, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x181818 }),
    );
    gun.position.set(0.5, 1.05, 0.3);
    g.add(gun);
    g.userData.legs = [legL, legR];
    g.userData.kind = 'player';
    const api = { mesh: g, pos: g.position, health: PLAYER.healthMax };
    return api;
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  toMenu() {
    this.state = 'menu';
    this.hud.showMenu('start');
  }

  startGame(opts = {}) {
    this.audio.start();
    this.audio.resume();
    this.state = 'playing';
    this.hud.hideMenu();
    if (this.missions.state === 'idle' && !this.missions.allDone) {
      this.missions.start();
    }
    if (!opts.skipIntro) this.audio.uiClick();
  }

  _menuAction() {
    this.audio.start();
    this.audio.resume();
    if (this.state === 'menu') {
      this.startGame();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.hud.hideMenu();
    } else if (this.state === 'busted' || this.state === 'wasted') {
      this._respawn();
      this.state = 'playing';
      this.hud.hideMenu();
    } else if (this.state === 'complete') {
      this.state = 'playing';
      this.hud.hideMenu();
    }
  }

  _respawn() {
    this.exitCar({ silent: true });
    this.player.pos.set(0, 0, 30);
    this.player.heading = 0;
    this.cameraYaw = 0;
    this.player.health = PLAYER.healthMax;
    this.player.mesh.visible = true;
    this.police.clearAll();
    this.missions.showMessage('', 'Back on the street. Marta still has work for you.', 4);
  }

  _applyPenalty() {
    this.money = Math.max(0, this.money - 200);
  }

  teleportPlayer(x, z, heading = 0) {
    this.player.pos.set(x, 0, z);
    this.player.heading = heading;
    this.cameraYaw = heading;
  }

  teleportCar(x, z, heading = 0) {
    if (!this.player.car) return;
    this.player.car.pos.set(x, 0, z);
    this.player.car.heading = heading;
    this.player.car.mesh.rotation.y = heading;
    this.player.car.speed = 0;
  }

  carSpeedForShot(speed) {
    if (this.player.car) this.player.car.speed = speed;
  }

  setCamera(yaw, pitch) {
    this.cameraYaw = yaw;
    this.cameraPitch = pitch;
  }

  spawnPlayerCar(x, z, color) {
    const car = new Car(this.scene, x, z, 0, color);
    this.parkedCars.push(car);
    return car;
  }

  enterCar(car, opts = {}) {
    this.player.inCar = true;
    this.player.car = car;
    car.isPlayer = true;
    car.occupied = true;
    this.player.mesh.visible = false;
    if (!opts.silent) {
      this.audio.carDoor();
      this.audio.uiClick();
    }
    // Stealing a car the player does not own is a crime.
    if (!opts.silent) {
      const isTarget = car === this.targetCar;
      this.police.addCrime(WANTED.stealStars);
      this.missions.showMessage('', isTarget ? 'That is the Comet GT. Now get it to the garage.' : 'Car stolen — the cops noticed.', 3);
    }
  }

  exitCar(opts = {}) {
    if (!this.player.inCar || !this.player.car) return;
    const car = this.player.car;
    car.isPlayer = false;
    car.speed = 0;
    // Step out on the driver's side.
    const side = car.heading + Math.PI / 2;
    this.player.pos.set(
      car.pos.x + Math.sin(side) * 2.2,
      0,
      car.pos.z + Math.cos(side) * 2.2,
    );
    resolveCollision(this.colliders, this.player.pos, PLAYER.radius);
    this.player.heading = car.heading;
    this.player.mesh.visible = true;
    this.player.inCar = false;
    this.player.car = null;
    if (!this.parkedCars.includes(car)) this.parkedCars.push(car);
    if (!opts.silent) this.audio.carDoor();
  }

  _nearestStealableCar() {
    const p = this.player.pos;
    let best = null;
    let bd = 4.5;
    const consider = (car) => {
      if (!car || car.isPlayer) return;
      const d = dist2d(car.pos.x, car.pos.z, p.x, p.z);
      if (d < bd) {
        bd = d;
        best = car;
      }
    };
    consider(this.targetCar);
    for (const car of this.parkedCars) consider(car);
    const trafficCar = this.traffic.nearestCar(p.x, p.z, 4.5);
    if (trafficCar) consider(trafficCar);
    return best;
  }

  _shoot() {
    if (this.player.inCar) return;
    // Aim from the camera through the crosshair. The camera ray ignores
    // the flat ground planes (they would always win at range and make
    // distant targets unhittable); it finds what the crosshair is really
    // on, then the bullet travels from Dario's pistol to that point.
    const camPos = this.camera.position.clone();
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    this.raycaster.set(camPos, camDir);
    this.raycaster.far = COMBAT.range;
    const aimTargets = this._shootTargets();
    const camHits = this.raycaster.intersectObjects(aimTargets, true);
    let aimPoint = null;
    for (const h of camHits) {
      // Skip the flat ground/sand/sea/plaza planes.
      if (h.object.geometry && h.object.geometry.type === 'PlaneGeometry') continue;
      aimPoint = h.point;
      break;
    }
    if (!aimPoint) aimPoint = camPos.clone().addScaledVector(camDir, COMBAT.range);
    const muzzle = this.player.pos.clone();
    muzzle.y = 1.4;
    const dir = aimPoint.clone().sub(muzzle).normalize();
    const hit = this.combat.fire(muzzle, dir, (o, d) => this._hitTest(o, d));
    if (!hit) return;
    if (hit.kind === 'guard') {
      const killed = this.missions.damageGuard(hit.target, COMBAT.damage);
      this.audio.hit();
      if (killed) {
        this.missions.showMessage('', 'Guard down.', 2);
        this.police.addCrime(1);
      }
    } else if (hit.kind === 'officer') {
      hit.target.health -= COMBAT.damage;
      this.audio.hit();
      if (hit.target.health <= 0) {
        this.police.killOfficer(hit.target);
        this.missions.showMessage('', 'Officer down — the whole force is coming now.', 3);
      }
    } else if (hit.kind === 'ped') {
      this._removePed(hit.target);
      this.police.addCrime(WANTED.shootStars);
    } else if (hit.kind === 'car') {
      this.police.addCrime(WANTED.shootStars);
    } else if (hit.kind === 'building') {
      // A puff of dust would be nice; the tracer already shows the hit.
    }
  }

  _removePed(ped) {
    const i = this.traffic.peds.indexOf(ped);
    if (i >= 0) this.traffic.peds.splice(i, 1);
    this.scene.remove(ped.mesh);
  }

  _shootTargets() {
    const targets = [];
    for (const g of this.missions.guards) targets.push(g.mesh);
    for (const o of this.police.officers) targets.push(o.mesh);
    for (const p of this.traffic.peds) targets.push(p.mesh);
    for (const c of this.traffic.cars) targets.push(c.mesh);
    if (this.targetCar) targets.push(this.targetCar.mesh);
    for (const c of this.parkedCars) targets.push(c.mesh);
    targets.push(this.city.group);
    return targets;
  }

  _hitTest(origin, dir) {
    this.raycaster.set(origin, dir);
    this.raycaster.far = COMBAT.range;
    const targets = this._shootTargets();
    const hits = this.raycaster.intersectObjects(targets, true);
    for (const h of hits) {
      let obj = h.object;
      let kind = null;
      let target = null;
      while (obj) {
        if (obj.userData && obj.userData.kind) {
          kind = obj.userData.kind;
          target = obj.userData.ref;
          break;
        }
        obj = obj.parent;
      }
      // Guard / officer / ped groups carry their record in userData via
      // the arrays above; resolve by identity instead.
      if (!kind) {
        const g = this.missions.guards.find((x) => x.mesh === h.object || x.mesh.children.includes(h.object));
        if (g) return { point: h.point, kind: 'guard', target: g };
        const o = this.police.officers.find((x) => x.mesh === h.object || x.mesh.children.includes(h.object));
        if (o) return { point: h.point, kind: 'officer', target: o };
        const p = this.traffic.peds.find((x) => x.mesh === h.object || x.mesh.children.includes(h.object));
        if (p) return { point: h.point, kind: 'ped', target: p };
        const c = [...this.traffic.cars, this.targetCar, ...this.parkedCars].find(
          (x) => x && (x.mesh === h.object || x.mesh.children.includes(h.object)),
        );
        if (c) return { point: h.point, kind: 'car', target: c };
        return { point: h.point, kind: 'building', target: null };
      }
      return { point: h.point, kind, target };
    }
    return null;
  }

  _guardFire(dt) {
    if (this.missions.index !== 3 || this.missions.state !== 'active') return;
    if (this.player.inCar) return;
    this.guardShootTimer -= dt;
    if (this.guardShootTimer > 0) return;
    const alive = this.missions.guards.filter((g) => dist2d(g.mesh.position.x, g.mesh.position.z, this.player.pos.x, this.player.pos.z) < 26);
    if (alive.length === 0) return;
    this.guardShootTimer = 2.0 + Math.random() * 1.2;
    const g = alive[Math.floor(Math.random() * alive.length)];
    // Red tracer from the guard to Dario.
    const pos = this.guardTracer.geometry.attributes.position;
    pos.setXYZ(0, g.mesh.position.x, 1.4, g.mesh.position.z);
    pos.setXYZ(1, this.player.pos.x, 1.2, this.player.pos.z);
    pos.needsUpdate = true;
    this.guardTracer.visible = true;
    this.guardTracerTimer = 0.09;
    this.audio.shot();
    this.player.health -= 4;
    if (this.player.health <= 0) {
      this.player.health = 0;
      this._wasted();
    }
  }

  _busted() {
    if (this.state !== 'playing') return;
    this._applyPenalty();
    this.state = 'busted';
    this.audio.busted();
    this.saveNow();
    this.hud.showMenu('busted', { money: this.money, debt: this.missions.debtRemaining, mission: this.missions.index + 1 });
  }

  _wasted() {
    if (this.state !== 'playing') return;
    this._applyPenalty();
    this.state = 'wasted';
    this.audio.wasted();
    this.saveNow();
    this.hud.showMenu('wasted', { money: this.money, debt: this.missions.debtRemaining, mission: this.missions.index + 1 });
  }

  saveNow() {
    saveGame({
      money: this.money,
      missionIndex: this.missions.index,
      health: this.player.health,
      playerX: this.player.pos.x,
      playerZ: this.player.pos.z,
      playerHeading: this.player.heading,
    });
  }

  frame(ms) {
    const dt = Math.min(0.05, (ms - (this._lastMs ?? ms)) / 1000 || 0.016);
    this._lastMs = ms;
    this.time += dt;

    // Clouds drift.
    for (const c of this.clouds) {
      c.position.x += dt * 1.2;
      if (c.position.x > 260) c.position.x = -260;
    }

    if (this.state === 'menu') {
      // Slow orbit over the plaza behind the start screen.
      const a = this.time * 0.05;
      this.camera.position.set(Math.sin(a) * 90, 42, Math.cos(a) * 90);
      this.camera.lookAt(0, 4, 0);
      this.traffic.update(dt, this.player.pos, 0);
      this.renderer.render(this.scene, this.camera);
      this.input.endFrame();
      return;
    }

    if (this.state === 'playing') {
      this._updatePlaying(dt);
    }

    if (this.state === 'busted' || this.state === 'wasted' || this.state === 'complete') {
      // Freeze the world behind the end screen, but keep rendering.
      this.renderer.render(this.scene, this.camera);
      if (this.input.wasPressed('Enter')) this._menuAction();
      this.input.endFrame();
      return;
    }

    // Paused: render, wait for P / click.
    if (this.state === 'paused') {
      this.renderer.render(this.scene, this.camera);
      if (this.input.wasPressed('KeyP') || this.input.wasPressed('Escape')) {
        this.state = 'playing';
        this.hud.hideMenu();
      }
      this.input.endFrame();
      return;
    }

    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  _updatePlaying(dt) {
    const input = this.input;

    // --- Global keys.
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
      this.state = 'paused';
      this.hud.showMenu('pause', { money: this.money, debt: this.missions.debtRemaining, mission: this.missions.index + 1 });
      return;
    }
    if (input.wasPressed('KeyM')) {
      this.audio.muted = !this.audio.muted;
    }
    if (input.wasPressed('Enter') && this.state === 'playing' && this.missions.allDone) {
      // nothing special; free roam continues
    }

    // --- Camera orbit from the mouse.
    const { dx, dy } = input.consumeMouseDelta();
    if (dx !== 0 || dy !== 0) {
      this.cameraYaw -= dx * 0.004;
      this.cameraPitch = clamp(this.cameraPitch + dy * 0.003, -0.05, 1.0);
      this.lastMouseTime = this.time;
    }

    const p = this.player;
    if (p.inCar && p.car) {
      // --- Driving.
      const throttle = input.down('KeyW') || input.down('ArrowUp') ? 1 : input.down('KeyS') || input.down('ArrowDown') ? -1 : 0;
      const steer = input.down('KeyA') || input.down('ArrowLeft') ? 1 : input.down('KeyD') || input.down('ArrowRight') ? -1 : 0;
      p.car.drive(dt, throttle, steer, this.colliders);
      // Camera swings behind the car unless the player just dragged it.
      if (this.time - this.lastMouseTime > 1.2) {
        this.cameraYaw = angleLerp(this.cameraYaw, p.car.heading, Math.min(1, dt * 1.6));
      }
      if (input.wasPressed('KeyE')) this.exitCar();
      // Police ramming slows the player's car.
      for (const pc of this.police.cars) {
        if (pc._ramming) p.car.speed *= Math.max(0, 1 - dt * 2.5);
      }
    } else {
      // --- On foot.
      const run = input.down('ShiftLeft') || input.down('ShiftRight');
      const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      let mx = 0;
      let mz = 0;
      const f = { x: Math.sin(this.cameraYaw), z: Math.cos(this.cameraYaw) };
      const r = { x: Math.cos(this.cameraYaw), z: -Math.sin(this.cameraYaw) };
      if (input.down('KeyW') || input.down('ArrowUp')) { mx += f.x; mz += f.z; }
      if (input.down('KeyS') || input.down('ArrowDown')) { mx -= f.x; mz -= f.z; }
      if (input.down('KeyD') || input.down('ArrowRight')) { mx += r.x; mz += r.z; }
      if (input.down('KeyA') || input.down('ArrowLeft')) { mx -= r.x; mz -= r.z; }
      const len = Math.hypot(mx, mz);
      if (len > 0) {
        mx /= len;
        mz /= len;
        p.pos.x += mx * speed * dt;
        p.pos.z += mz * speed * dt;
        p.heading = Math.atan2(mx, mz);
        p.mesh.rotation.y = p.heading;
        p.walkPhase += dt * speed * 1.6;
        const swing = Math.sin(p.walkPhase) * 0.55;
        p.mesh.userData.legs[0].rotation.x = swing;
        p.mesh.userData.legs[1].rotation.x = -swing;
      } else {
        p.mesh.userData.legs[0].rotation.x = 0;
        p.mesh.userData.legs[1].rotation.x = 0;
      }
      resolveCollision(this.colliders, p.pos, PLAYER.radius);
      p.pos.x = clamp(p.pos.x, -WORLD_HALF, WORLD_HALF);
      p.pos.z = clamp(p.pos.z, -WORLD_HALF, WORLD_HALF);

      // Enter / steal a car.
      if (input.wasPressed('KeyE')) {
        const car = this._nearestStealableCar();
        if (car) {
          // Taking a traffic car out of traffic: it stops cruising.
          const ti = this.traffic.cars.indexOf(car);
          if (ti >= 0) this.traffic.cars.splice(ti, 1);
          this.enterCar(car);
        }
      }
      // Shooting.
      if (input.consumeClick()) this._shoot();
      if (input.wasPressed('KeyR')) this.combat.startReload();
    }

    // --- Systems.
    this.combat.update(dt);
    this._guardFire(dt);
    if (this.guardTracerTimer > 0) {
      this.guardTracerTimer -= dt;
      if (this.guardTracerTimer <= 0) this.guardTracer.visible = false;
    }
    const playerSpeed = p.inCar && p.car ? p.car.speed : 0;
    this.police.update(dt, p.inCar && p.car ? p.car.pos : p.pos, p.inCar, playerSpeed, () => this._busted());
    this.traffic.update(dt, p.inCar && p.car ? p.car.pos : p.pos, this.police.stars);
    const result = this.missions.update(dt, p.inCar && p.car ? p.car.pos : p.pos, p.inCar, p.car);
    if (result) {
      this.money += result.pay;
      this.saveNow();
      if (result.allDone) {
        this.state = 'complete';
        this.hud.showMenu('complete', { money: this.money, debt: 0, mission: 4 });
      }
    }

    // Health regens slowly when the heat is off.
    if (this.police.stars === 0 && p.health < PLAYER.healthMax) {
      p.health = Math.min(PLAYER.healthMax, p.health + dt * 3);
    }

    // --- Camera.
    const focus = p.inCar && p.car ? p.car.pos : p.pos;
    const dist = p.inCar ? 11 : 7.5;
    const height = p.inCar ? 4.4 : 3.2;
    const lookHeight = 1.5;
    const cp = Math.cos(this.cameraPitch);
    const sp = Math.sin(this.cameraPitch);
    const cx = focus.x - Math.sin(this.cameraYaw) * dist * cp;
    const cz = focus.z - Math.cos(this.cameraYaw) * dist * cp;
    const cy = lookHeight + height * sp;
    this.camera.position.set(cx, cy, cz);
    // Look well ahead of the player so the crosshair sits on distant
    // targets instead of the street in front of them.
    this.camera.lookAt(focus.x + Math.sin(this.cameraYaw) * 10, lookHeight, focus.z + Math.cos(this.cameraYaw) * 10);

    // --- Audio.
    this.audio.update(playerSpeed, this.police.stars, p.inCar);

    // --- HUD + minimap.
    const interact = !p.inCar && this._nearestStealableCar()
      ? (this._nearestStealableCar() === this.targetCar ? 'Press E — steal the Comet GT' : 'Press E — steal car')
      : null;
    this.hud.update({
      health: p.health,
      money: this.money,
      debt: this.missions.debtRemaining,
      stars: this.police.stars,
      ammo: this.combat.ammo,
      reserve: this.combat.reserve,
      reloading: this.combat.reloading,
      speed: playerSpeed,
      inCar: p.inCar,
      objective: this.missions.objectiveText,
      message: this.missions.message,
      messageTimer: this.missions.messageTimer,
      interact,
      bustProgress: this.police.bustProgress,
    });
    this.hud.drawMinimap({
      playerX: focus.x,
      playerZ: focus.z,
      playerHeading: p.inCar && p.car ? p.car.heading : p.heading,
      policeCars: this.police.cars.map((c) => ({ x: c.pos.x, z: c.pos.z })),
      officers: this.police.officers.map((o) => ({ x: o.mesh.position.x, z: o.mesh.position.z })),
      trafficCars: this.traffic.cars.map((c) => ({ x: c.pos.x, z: c.pos.z })),
      missionX: this.missions.beacon.visible ? this.missions.beacon.position.x : null,
      missionZ: this.missions.beacon.visible ? this.missions.beacon.position.z : null,
      missionVisible: this.missions.beacon.visible,
      guards: this.missions.guards.map((g) => ({ x: g.mesh.position.x, z: g.mesh.position.z })),
    });

    // --- Autosave.
    this.saveTimer += dt;
    if (this.saveTimer >= SAVE_EVERY_SECONDS) {
      this.saveTimer = 0;
      this.saveNow();
    }
  }
}

// Boot.
new Game();
