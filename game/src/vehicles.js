// SOLMAR HEAT — vehicles.js
// One clear job: build low-poly cars from boxes and drive them with arcade
// physics (accelerate, brake, reverse, steer, collide with buildings).
// Every car in the game — the player's stolen rides, traffic and police —
// is a Car made here.

import * as THREE from 'three';
import { CAR, clamp, angleLerp, ROAD_LINES } from './config.js';
import { resolveCollision } from './city.js';

const CAR_COLORS = [
  0xc0392b, 0x2e6fc2, 0xe8c832, 0xeeeeee, 0x222831, 0x7a4a9e,
  0x2fae7a, 0xe07a2a, 0x9aa4ac, 0x4a90d9,
];

export function makeCarMesh(color, opts = {}) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a2028 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, 4.4), bodyMat);
  body.position.y = 0.65;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 2.2), darkMat);
  cabin.position.set(0, 1.3, -0.2);
  cabin.castShadow = true;
  g.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    g.add(w);
    wheels.push(w);
  }
  // Headlights and tail lights so cars read at a glance.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const hx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), headMat);
    h.position.set(hx, 0.7, 2.22);
    g.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const hx of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), tailMat);
    t.position.set(hx, 0.7, -2.22);
    g.add(t);
  }
  if (opts.police) {
    // Light bar on the roof.
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar.position.set(-0.3, 1.72, -0.2);
    g.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar2.position.set(0.45, 1.72, -0.2);
    g.add(bar2);
    g.userData.lightBar = [bar, bar2];
  }
  g.userData.wheels = wheels;
  return g;
}

export class Car {
  constructor(scene, x, z, heading, color, opts = {}) {
    this.mesh = makeCarMesh(color, opts);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.color = color;
    this.isPolice = !!opts.police;
    this.isPlayer = false;
    this.occupied = false;
    this.wheelSpin = 0;
    scene.add(this.mesh);
  }

  get pos() {
    return this.mesh.position;
  }

  // Arcade driving: throttle -1..1, steerInput -1..1.
  drive(dt, throttle, steerInput, colliders) {
    const maxF = CAR.maxSpeed;
    const maxR = CAR.maxReverse;
    if (throttle > 0) this.speed += CAR.accel * throttle * dt;
    else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= CAR.brake * dt;
      else this.speed += CAR.reverseAccel * throttle * dt;
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 8 * dt);
    }
    this.speed = clamp(this.speed, -maxR, maxF);
    const steerTarget = steerInput * CAR.steer * clamp(Math.abs(this.speed) / 10, 0.2, 1);
    this.steer = angleLerp(this.steer, steerTarget, Math.min(1, dt * 8));
    if (Math.abs(this.speed) > 0.05) {
      this.heading += (this.steer * this.speed * dt) / 4.4;
    }
    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    const oldX = this.pos.x;
    const oldZ = this.pos.z;
    this.pos.x = nx;
    this.pos.z = nz;
    if (colliders && resolveCollision(colliders, this.pos, 1.6)) {
      // Hit a building: kill most of the speed, keep the slide.
      this.speed *= 0.35;
      if (Math.abs(this.pos.x - oldX) < 0.001 && Math.abs(this.pos.z - oldZ) < 0.001) {
        this.pos.x = oldX;
        this.pos.z = oldZ;
      }
    }
    // Keep cars inside the drivable world.
    this.pos.x = clamp(this.pos.x, -205, 205);
    this.pos.z = clamp(this.pos.z, -205, 205);
    this.mesh.rotation.y = this.heading;
    this.wheelSpin += this.speed * dt * 2.4;
    for (const w of this.mesh.userData.wheels) w.rotation.x = this.wheelSpin;
  }

  remove(scene) {
    scene.remove(this.mesh);
  }
}

export function randomCarColor(rng) {
  return CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
}

// Nearest road line to a coordinate, for snapping traffic onto roads.
export function nearestRoad(v) {
  let best = ROAD_LINES[0];
  let bd = Infinity;
  for (const line of ROAD_LINES) {
    const d = Math.abs(v - line);
    if (d < bd) {
      bd = d;
      best = line;
    }
  }
  return best;
}
