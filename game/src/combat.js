// SOLMAR HEAT — combat.js
// One clear job: the pistol. Raycast shooting with a visible tracer,
// a 12-round magazine, reload, and hit feedback. The shooter (main.js)
// asks here to fire; this module owns ammo, timing and the tracer mesh.

import * as THREE from 'three';
import { COMBAT } from './config.js';

export class Combat {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.ammo = COMBAT.magazine;
    this.reserve = COMBAT.reserveMax;
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.tracer = null;
    this.tracerTimer = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.tracer = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 }),
    );
    this.tracer.visible = false;
    this.tracer.frustumCulled = false;
    scene.add(this.tracer);
  }

  get reloading() {
    return this.reloadTimer > 0;
  }

  get canFire() {
    return this.cooldown <= 0 && this.reloadTimer <= 0 && this.ammo > 0;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const need = COMBAT.magazine - this.ammo;
        const take = Math.min(need, this.reserve);
        this.ammo += take;
        this.reserve -= take;
      }
    }
    if (this.tracerTimer > 0) {
      this.tracerTimer -= dt;
      if (this.tracerTimer <= 0) this.tracer.visible = false;
    }
  }

  startReload() {
    if (this.reloadTimer <= 0 && this.ammo < COMBAT.magazine && this.reserve > 0) {
      this.reloadTimer = COMBAT.reloadSeconds;
      this.audio?.reload();
      return true;
    }
    return false;
  }

  // Fire one shot along dir from origin. hitTest(origin, dir) is the
  // shooter's callback: it returns {point, kind} for the nearest hit
  // (guard, officer, traffic car, pedestrian, building) or null.
  // Returns the hit record (or null) so the caller can apply effects.
  fire(origin, dir, hitTest) {
    if (!this.canFire) {
      if (this.ammo === 0 && this.cooldown <= 0) this.audio?.emptyClick();
      return null;
    }
    this.cooldown = COMBAT.fireSeconds;
    this.ammo -= 1;
    this.audio?.shot();
    const hit = hitTest ? hitTest(origin, dir) : null;
    const end = hit ? hit.point : origin.clone().addScaledVector(dir, COMBAT.range);
    const pos = this.tracer.geometry.attributes.position;
    pos.setXYZ(0, origin.x, origin.y, origin.z);
    pos.setXYZ(1, end.x, end.y, end.z);
    pos.needsUpdate = true;
    this.tracer.visible = true;
    this.tracerTimer = 0.07;
    if (this.ammo === 0) this.startReload();
    return hit;
  }

  reset() {
    this.ammo = COMBAT.magazine;
    this.reserve = COMBAT.reserveMax;
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.tracer.visible = false;
  }
}
