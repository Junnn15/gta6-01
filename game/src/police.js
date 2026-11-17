// SOLMAR HEAT — police.js
// One clear job: the wanted system. Stars rise on crime and decay after
// ~18 crime-free seconds; police cars and foot officers spawn, chase the
// player, and bust them when an officer stays close on foot. Killing an
// officer is the fastest way to five stars.

import * as THREE from 'three';
import { WANTED, clamp, angleLerp, dist2d } from './config.js';
import { Car } from './vehicles.js';

export class Police {
  constructor(scene, colliders, seed = 1) {
    this.scene = scene;
    this.colliders = colliders;
    this.stars = 0;
    this.crimeTimer = 0; // seconds since the last crime
    this.cars = [];
    this.officers = [];
    this.bustProgress = 0;
    this.spawnTimer = 0;
    this.flashPhase = 0;
    void seed;
  }

  addCrime(stars) {
    this.stars = clamp(this.stars + stars, 0, WANTED.maxStars);
    this.crimeTimer = 0;
  }

  get wanted() {
    return this.stars;
  }

  _spawnPoliceCar(playerPos) {
    // Spawn a police car on a road a short distance from the player.
    const angle = Math.random() * Math.PI * 2;
    const dist = 45 + Math.random() * 25;
    const x = clamp(playerPos.x + Math.sin(angle) * dist, -160, 160);
    const z = clamp(playerPos.z + Math.cos(angle) * dist, -160, 160);
    const car = new Car(this.scene, x, z, Math.atan2(playerPos.x - x, playerPos.z - z), 0x1a1a22, { police: true });
    car.isPolice = true;
    car.speed = 0;
    this.cars.push(car);
    return car;
  }

  _spawnOfficer(playerPos) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 22 + Math.random() * 10;
    const x = clamp(playerPos.x + Math.sin(angle) * dist, -165, 165);
    const z = clamp(playerPos.z + Math.cos(angle) * dist, -165, 165);
    const g = new THREE.Group();
    const navy = new THREE.MeshLambertMaterial({ color: 0x1c2f55 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd8a878 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.0, 0.42), navy);
    body.position.y = 1.05;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
    head.position.y = 1.8;
    g.add(head);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.5), new THREE.MeshLambertMaterial({ color: 0x101828 }));
    cap.position.y = 2.05;
    g.add(cap);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x141c28 });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.6, 0.26), legMat);
    legL.position.set(-0.16, 0.3, 0);
    g.add(legL);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.6, 0.26), legMat);
    legR.position.set(0.16, 0.3, 0);
    g.add(legR);
    g.position.set(x, 0, z);
    g.userData.legs = [legL, legR];
    this.scene.add(g);
    const officer = { mesh: g, health: 100, walkPhase: Math.random() * 6, speed: 5.2 };
    this.officers.push(officer);
    return officer;
  }

  // Desired force scales with stars: 1 star = 1 car, 5 stars = 4 cars + 4 officers.
  _desiredForce() {
    const s = this.stars;
    return {
      cars: s === 0 ? 0 : Math.min(1 + Math.floor(s / 2), 4),
      officers: s >= 3 ? Math.min(s - 1, 4) : 0,
    };
  }

  update(dt, playerPos, playerInCar, playerSpeed, onBusted) {
    this.flashPhase += dt;
    this.crimeTimer += dt;
    if (this.stars > 0 && this.crimeTimer >= WANTED.decaySeconds) {
      this.stars -= 1;
      this.crimeTimer = 0;
    }

    const want = this._desiredForce();
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      if (this.cars.length < want.cars) this._spawnPoliceCar(playerPos);
      if (this.officers.length < want.officers) this._spawnOfficer(playerPos);
      this.spawnTimer = 1.2;
    }
    // Despawn the excess when stars fall.
    while (this.cars.length > want.cars) {
      const c = this.cars.pop();
      c.remove(this.scene);
    }
    while (this.officers.length > want.officers) {
      const o = this.officers.pop();
      this.scene.remove(o.mesh);
    }

    // --- Police cars chase: steer toward the player, faster with stars.
    const chaseSpeed = 20 + this.stars * 2.5;
    for (const car of this.cars) {
      const d = dist2d(car.pos.x, car.pos.z, playerPos.x, playerPos.z);
      const targetHeading = Math.atan2(playerPos.x - car.pos.x, playerPos.z - car.pos.z);
      car.heading = angleLerp(car.heading, targetHeading, Math.min(1, dt * 2.2));
      const throttle = d > 6 ? 1 : 0.3;
      const prev = { x: car.pos.x, z: car.pos.z };
      car.drive(dt, throttle, 0, this.colliders);
      // Police cars are faster than traffic; clamp to chase speed.
      if (car.speed > chaseSpeed) car.speed = chaseSpeed;
      // If a building pinned the car, back it out.
      if (Math.hypot(car.pos.x - prev.x, car.pos.z - prev.z) < 0.01 && d > 12) {
        car.heading += Math.PI * 0.7;
        car.speed = -6;
      }
      // Flash the light bar.
      if (car.mesh.userData.lightBar) {
        const on = Math.sin(this.flashPhase * 10) > 0;
        car.mesh.userData.lightBar[0].material.color.setHex(on ? 0x4488ff : 0x112244);
        car.mesh.userData.lightBar[1].material.color.setHex(on ? 0x881111 : 0xff2222);
      }
    }

    // --- Officers run at the player on foot.
    let nearestOfficer = Infinity;
    for (const o of this.officers) {
      const d = dist2d(o.mesh.position.x, o.mesh.position.z, playerPos.x, playerPos.z);
      nearestOfficer = Math.min(nearestOfficer, d);
      const heading = Math.atan2(playerPos.x - o.mesh.position.x, playerPos.z - o.mesh.position.z);
      o.mesh.rotation.y = heading;
      const sp = playerInCar ? o.speed * 0.6 : o.speed;
      o.mesh.position.x += Math.sin(heading) * sp * dt;
      o.mesh.position.z += Math.cos(heading) * sp * dt;
      o.walkPhase += dt * sp * 2.6;
      const swing = Math.sin(o.walkPhase) * 0.55;
      o.mesh.userData.legs[0].rotation.x = swing;
      o.mesh.userData.legs[1].rotation.x = -swing;
    }

    // --- Busted: an officer must stand next to the player on foot.
    if (!playerInCar && nearestOfficer < WANTED.bustDistance) {
      this.bustProgress += dt;
      if (this.bustProgress >= WANTED.bustSeconds) {
        this.bustProgress = 0;
        onBusted?.();
      }
    } else {
      this.bustProgress = Math.max(0, this.bustProgress - dt * 2);
    }

    // Ramming: a police car touching the player's car slows it hard.
    if (playerInCar) {
      for (const car of this.cars) {
        const d = dist2d(car.pos.x, car.pos.z, playerPos.x, playerPos.z);
        if (d < 3.4) {
          // nudge the player car sideways; main.js reads this via the
          // returned collision list (see collidePlayerCar).
          car._ramming = true;
        } else {
          car._ramming = false;
        }
      }
    }
    void playerSpeed;
  }

  // Officers hit by a bullet: returns the officer hit, or null.
  hitOfficer(origin, dir, maxDist) {
    let best = null;
    let bd = maxDist;
    for (const o of this.officers) {
      // Ray vs vertical capsule approximated as a sphere at chest height.
      const cx = o.mesh.position.x - origin.x;
      const cy = 1.2 - origin.y;
      const cz = o.mesh.position.z - origin.z;
      const t = cx * dir.x + cy * dir.y + cz * dir.z;
      if (t < 0 || t > bd) continue;
      const px = origin.x + dir.x * t;
      const py = origin.y + dir.y * t;
      const pz = origin.z + dir.z * t;
      const d = Math.hypot(px - o.mesh.position.x, py - 1.2, pz - o.mesh.position.z);
      if (d < 1.3) {
        bd = t;
        best = o;
      }
    }
    return best;
  }

  killOfficer(officer) {
    const i = this.officers.indexOf(officer);
    if (i >= 0) this.officers.splice(i, 1);
    this.scene.remove(officer.mesh);
    this.addCrime(WANTED.killOfficerStars);
  }

  clearAll() {
    for (const c of this.cars) c.remove(this.scene);
    for (const o of this.officers) this.scene.remove(o.mesh);
    this.cars = [];
    this.officers = [];
    this.stars = 0;
    this.crimeTimer = 0;
    this.bustProgress = 0;
  }
}
