// SOLMAR HEAT — traffic.js
// One clear job: the living city. Twelve traffic cars cruise the road
// grid and eighteen pedestrians walk the sidewalks, all with simple
// waypoint AI. They make Solmar feel alive and give the player cars
// to steal and streets to cross.

import * as THREE from 'three';
import { ROAD_LINES, CITY_HALF, mulberry32, clamp } from './config.js';
import { Car, randomCarColor, nearestRoad } from './vehicles.js';
import { resolveCollision } from './city.js';

const PED_COLORS = [0xd96a5a, 0x5a8fd9, 0x7ac25a, 0xe8c832, 0x9a6ad9, 0xe89a5a, 0x5ad9c2];

export class Traffic {
  constructor(scene, colliders, seed = 1) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = mulberry32(seed + 77);
    this.cars = [];
    this.peds = [];
    this._spawnCars();
    this._spawnPeds();
  }

  _spawnCars() {
    for (let i = 0; i < 12; i++) {
      const alongRoad = this.rng() < 0.5;
      const line = ROAD_LINES[Math.floor(this.rng() * ROAD_LINES.length)];
      const t = (this.rng() * 2 - 1) * (CITY_HALF - 10);
      const x = alongRoad ? line : t;
      const z = alongRoad ? t : line;
      const heading = alongRoad ? (this.rng() < 0.5 ? 0 : Math.PI) : this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      const car = new Car(this.scene, x, z, heading, randomCarColor(this.rng));
      car.speed = 6 + this.rng() * 5;
      car.cruiseSpeed = car.speed;
      car.axis = alongRoad ? 'z' : 'x';
      car.road = line;
      car.turnAt = (this.rng() * 2 - 1) * CITY_HALF;
      this.cars.push(car);
    }
  }

  _makePed(x, z) {
    const g = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: PED_COLORS[Math.floor(this.rng() * PED_COLORS.length)] });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd8a878 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.4), shirt);
    body.position.y = 1.05;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
    head.position.y = 1.8;
    head.castShadow = true;
    g.add(head);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3a4a });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.6, 0.26), legMat);
    legL.position.set(-0.16, 0.3, 0);
    g.add(legL);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.6, 0.26), legMat);
    legR.position.set(0.16, 0.3, 0);
    g.add(legR);
    g.position.set(x, 0, z);
    g.userData.legs = [legL, legR];
    this.scene.add(g);
    return {
      mesh: g,
      heading: this.rng() * Math.PI * 2,
      speed: 1.2 + this.rng() * 1.1,
      walkPhase: this.rng() * Math.PI * 2,
      retarget: 0,
      fleeing: false,
    };
  }

  _spawnPeds() {
    for (let i = 0; i < 18; i++) {
      const line = ROAD_LINES[Math.floor(this.rng() * ROAD_LINES.length)];
      const t = (this.rng() * 2 - 1) * (CITY_HALF - 8);
      const side = this.rng() < 0.5 ? 7 : -7;
      const x = this.rng() < 0.5 ? line + side : t;
      const z = this.rng() < 0.5 ? t : line + side;
      // Keep pedestrians out of the plaza fountain and buildings.
      if (Math.abs(x) < 10 && Math.abs(z) < 10) continue;
      this.peds.push(this._makePed(x, z));
    }
  }

  update(dt, playerPos, wanted) {
    // --- Traffic cars: cruise their road, turn at intersections.
    for (const car of this.cars) {
      const along = car.axis === 'z' ? car.pos.z : car.pos.x;
      if (Math.abs(along - car.turnAt) < 1.5) {
        // Pick a new road and a new direction at this intersection.
        const newRoad = ROAD_LINES[Math.floor(this.rng() * ROAD_LINES.length)];
        const dir = this.rng() < 0.5 ? 1 : -1;
        if (car.axis === 'z') {
          car.axis = 'x';
          car.road = nearestRoad(car.pos.z);
          car.pos.x = clamp(car.pos.x, -CITY_HALF, CITY_HALF);
          car.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          car.turnAt = (this.rng() * 2 - 1) * CITY_HALF;
        } else {
          car.axis = 'z';
          car.road = nearestRoad(car.pos.x);
          car.pos.z = clamp(car.pos.z, -CITY_HALF, CITY_HALF);
          car.heading = dir > 0 ? 0 : Math.PI;
          car.turnAt = (this.rng() * 2 - 1) * CITY_HALF;
        }
        void newRoad;
      }
      // Ease speed toward cruise speed; slow near the player to avoid
      // silly pile-ups on the player's bumper.
      const dx = car.pos.x - playerPos.x;
      const dz = car.pos.z - playerPos.z;
      const dPlayer = Math.sqrt(dx * dx + dz * dz);
      const targetSpeed = dPlayer < 8 ? car.cruiseSpeed * 0.35 : car.cruiseSpeed;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.5);
      const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
      car.pos.x = nx;
      car.pos.z = nz;
      if (resolveCollision(this.colliders, car.pos, 1.6)) car.speed *= 0.4;
      car.pos.x = clamp(car.pos.x, -CITY_HALF - 5, CITY_HALF + 5);
      car.pos.z = clamp(car.pos.z, -CITY_HALF - 5, CITY_HALF + 5);
      car.mesh.rotation.y = car.heading;
      car.wheelSpin += car.speed * dt * 2.4;
      for (const w of car.mesh.userData.wheels) w.rotation.x = car.wheelSpin;
    }

    // --- Pedestrians: stroll the sidewalks, scatter when wanted is high.
    for (const p of this.peds) {
      p.retarget -= dt;
      const dx = p.mesh.position.x - playerPos.x;
      const dz = p.mesh.position.z - playerPos.z;
      const dPlayer = Math.sqrt(dx * dx + dz * dz);
      if (wanted >= 2 && dPlayer < 14) {
        // Flee from the player.
        p.fleeing = true;
        p.heading = Math.atan2(dx, dz);
      } else if (p.retarget <= 0) {
        p.fleeing = false;
        // Wander: mostly along the nearest road's sidewalk.
        const nearX = nearestRoad(p.mesh.position.x);
        const nearZ = nearestRoad(p.mesh.position.z);
        if (Math.abs(p.mesh.position.x - nearX) < Math.abs(p.mesh.position.z - nearZ)) {
          p.heading = (this.rng() < 0.5 ? 0 : Math.PI) + (this.rng() - 0.5) * 0.4;
        } else {
          p.heading = (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) + (this.rng() - 0.5) * 0.4;
        }
        p.retarget = 3 + this.rng() * 5;
      }
      const sp = p.fleeing ? p.speed * 2.6 : p.speed;
      p.mesh.position.x += Math.sin(p.heading) * sp * dt;
      p.mesh.position.z += Math.cos(p.heading) * sp * dt;
      resolveCollision(this.colliders, p.mesh.position, 0.7);
      p.mesh.position.x = clamp(p.mesh.position.x, -CITY_HALF - 6, CITY_HALF + 6);
      p.mesh.position.z = clamp(p.mesh.position.z, -CITY_HALF - 6, CITY_HALF + 6);
      p.mesh.rotation.y = p.heading;
      p.walkPhase += dt * sp * 3.2;
      const swing = Math.sin(p.walkPhase) * 0.5;
      p.mesh.userData.legs[0].rotation.x = swing;
      p.mesh.userData.legs[1].rotation.x = -swing;
    }
  }

  // Nearest drivable car to a point (for stealing).
  nearestCar(x, z, maxDist) {
    let best = null;
    let bd = maxDist;
    for (const car of this.cars) {
      const d = Math.hypot(car.pos.x - x, car.pos.z - z);
      if (d < bd) {
        bd = d;
        best = car;
      }
    }
    return best;
  }
}
