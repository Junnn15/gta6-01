// SOLMAR HEAT — city.js
// One clear job: build the whole city of Solmar as three.js meshes and
// report the axis-aligned collision boxes the player and cars must respect.
// Roads, sidewalks, towers, the central plaza with its fountain, the beach
// strip, the marina with docks and boats, palms and street lamps.

import * as THREE from 'three';
import {
  ROAD_LINES,
  ROAD_WIDTH,
  BLOCK_SIZE,
  CITY_HALF,
  WORLD_HALF,
  BEACH_Z,
  SEA_Z,
  COLORS,
  mulberry32,
} from './config.js';

function box(w, h, d, color, x, y, z, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({ color, ...(opts.mat || {}) });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (opts.ry) m.rotation.y = opts.ry;
  m.castShadow = !!opts.shadow;
  m.receiveShadow = !!opts.receive;
  return m;
}

export function buildCity(scene, seed = 1) {
  const rng = mulberry32(seed);
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const group = new THREE.Group();
  group.name = 'city';

  // --- Ground: grass-green base under the whole map.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2 + 80, WORLD_HALF * 2 + 80),
    new THREE.MeshLambertMaterial({ color: 0x7fae62 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // --- Asphalt: one big slab, sidewalks drawn as a lighter slab above it.
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + ROAD_WIDTH + 4, CITY_HALF * 2 + ROAD_WIDTH + 4),
    new THREE.MeshLambertMaterial({ color: COLORS.asphalt }),
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.y = 0.02;
  asphalt.receiveShadow = true;
  group.add(asphalt);

  // Road centre dashes (thin white boxes, cheap and readable).
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d8c8 });
  const dashGeo = new THREE.BoxGeometry(0.5, 0.02, 3);
  for (const line of ROAD_LINES) {
    for (let t = -CITY_HALF; t <= CITY_HALF; t += 12) {
      const d1 = new THREE.Mesh(dashGeo, dashMat);
      d1.position.set(line, 0.05, t);
      group.add(d1);
      const d2 = new THREE.Mesh(dashGeo, dashMat);
      d2.position.set(t, 0.05, line);
      d2.rotation.y = Math.PI / 2;
      group.add(d2);
    }
  }

  // --- Buildings: one tower per block, skipping the central plaza block.
  const palette = COLORS.building;
  const glassMat = new THREE.MeshLambertMaterial({ color: COLORS.glass });
  for (let ix = 0; ix < ROAD_LINES.length - 1; ix++) {
    for (let iz = 0; iz < ROAD_LINES.length - 1; iz++) {
      const cx = (ROAD_LINES[ix] + ROAD_LINES[ix + 1]) / 2;
      const cz = (ROAD_LINES[iz] + ROAD_LINES[iz + 1]) / 2;
      // Central plaza block stays open.
      if (Math.abs(cx) < 1 && Math.abs(cz) < 1) continue;
      // Landmark blocks stay open too: the Coral Bank (25,25) and the
      // garage (125,-125) are built by hand below, so no tower may
      // swallow them (or the guards and mission markers around them).
      if (Math.abs(cx - 25) < 1 && Math.abs(cz - 25) < 1) continue;
      if (Math.abs(cx - 125) < 1 && Math.abs(cz + 125) < 1) continue;
      // A few blocks are parks with palms instead of towers.
      if (rng() < 0.14) {
        buildPark(group, cx, cz, rng);
        continue;
      }
      const w = 16 + rng() * 16;
      const d = 16 + rng() * 16;
      const h = 12 + rng() * rng() * 55;
      const color = palette[Math.floor(rng() * palette.length)];
      const tower = box(w, h, d, color, cx, h / 2, cz, { shadow: true, receive: true });
      group.add(tower);
      // Glass band near the top so towers read as offices, not slabs.
      const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, Math.min(3, h * 0.12), d + 0.3), glassMat);
      band.position.set(cx, h * 0.82, cz);
      group.add(band);
      // Rooftop box.
      const roof = box(Math.min(6, w * 0.3), 2.5, Math.min(6, d * 0.3), 0x8a8f96, cx, h + 1.2, cz);
      group.add(roof);
      const pad = 1.2;
      colliders.push({
        minX: cx - w / 2 - pad,
        maxX: cx + w / 2 + pad,
        minZ: cz - d / 2 - pad,
        maxZ: cz + d / 2 + pad,
      });
    }
  }

  // --- Central plaza: pale stone square with a fountain at (0,0).
  const plaza = new THREE.Mesh(
    new THREE.PlaneGeometry(BLOCK_SIZE + ROAD_WIDTH, BLOCK_SIZE + ROAD_WIDTH),
    new THREE.MeshLambertMaterial({ color: COLORS.plaza }),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.04;
  plaza.receiveShadow = true;
  group.add(plaza);
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 8, 1.2, 24),
    new THREE.MeshLambertMaterial({ color: 0x9aa4ac }),
  );
  basin.position.set(0, 0.6, 0);
  basin.castShadow = true;
  group.add(basin);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(6.2, 6.2, 0.4, 24),
    new THREE.MeshLambertMaterial({ color: 0x4fb0d8, transparent: true, opacity: 0.85 }),
  );
  water.position.set(0, 1.1, 0);
  group.add(water);
  const spout = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 1, 3.4, 10),
    new THREE.MeshLambertMaterial({ color: 0xc8ccd0 }),
  );
  spout.position.set(0, 1.8, 0);
  group.add(spout);
  colliders.push({ minX: -8, maxX: 8, minZ: -8, maxZ: 8 });

  // --- Beach strip (south, +z) and the sea beyond it.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2 + 80, SEA_Z - BEACH_Z + 22),
    new THREE.MeshLambertMaterial({ color: COLORS.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.03, (BEACH_Z + SEA_Z) / 2 + 6);
  sand.receiveShadow = true;
  group.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2 + 200, 120),
    new THREE.MeshLambertMaterial({ color: COLORS.sea }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.02, SEA_Z + 60);
  group.add(sea);
  // Beach umbrellas.
  for (let i = 0; i < 8; i++) {
    const ux = -160 + i * 44 + rng() * 12;
    const uz = BEACH_Z + 6 + rng() * 8;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 3, 6),
      new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }),
    );
    pole.position.set(ux, 1.5, uz);
    group.add(pole);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 1.1, 10),
      new THREE.MeshLambertMaterial({ color: i % 2 ? 0xe86a5a : 0x5aa8e8 }),
    );
    top.position.set(ux, 3.4, uz);
    top.castShadow = true;
    group.add(top);
  }

  // --- Marina (east, +x): wooden docks and little boats.
  const dockMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
  for (let i = 0; i < 3; i++) {
    const dz = 40 + i * 40;
    const dock = new THREE.Mesh(new THREE.BoxGeometry(26, 0.6, 4), dockMat);
    dock.position.set(196, 0.3, dz);
    dock.castShadow = true;
    group.add(dock);
    const boat = buildBoat(rng);
    boat.position.set(206, 0.4, dz + 8);
    boat.rotation.y = Math.PI / 2 + (rng() - 0.5) * 0.3;
    group.add(boat);
  }
  // Marina gate marker post (mission 1 target lives here).
  const gatePost = box(1, 5, 1, 0xf0c040, 168, 2.5, 120, { shadow: true });
  group.add(gatePost);

  // --- Palms along the sidewalks and plaza corners.
  const palmSpots = [];
  for (const line of ROAD_LINES) {
    for (let t = -CITY_HALF + 15; t <= CITY_HALF - 10; t += 50) {
      if (Math.abs(line) < 1 && Math.abs(t) < 30) continue;
      palmSpots.push([line + ROAD_WIDTH / 2 + 2.5, t]);
      palmSpots.push([line - ROAD_WIDTH / 2 - 2.5, t + 25]);
    }
  }
  for (const [px, pz] of palmSpots) {
    if (rng() < 0.35) group.add(buildPalm(px, pz, rng));
  }
  // Plaza corner palms.
  for (const [px, pz] of [[-22, -22], [22, -22], [-22, 22], [22, 22]]) {
    group.add(buildPalm(px, pz, rng));
  }

  // --- Street lamps at intersections.
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2c2f33 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const lx of ROAD_LINES) {
    for (const lz of ROAD_LINES) {
      if ((lx + lz) % 100 !== 0) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6, 6), lampMat);
      pole.position.set(lx + ROAD_WIDTH / 2 + 1, 3, lz + ROAD_WIDTH / 2 + 1);
      group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), bulbMat);
      bulb.position.set(lx + ROAD_WIDTH / 2 + 1, 6.2, lz + ROAD_WIDTH / 2 + 1);
      group.add(bulb);
    }
  }

  // --- Landmark signs: Coral Bank (mission 4) and the garage (mission 2).
  const bank = box(20, 14, 14, 0xe8e0c8, 25, 7, 25, { shadow: true });
  group.add(bank);
  colliders.push({ minX: 14, maxX: 36, minZ: 17, maxZ: 33 });
  const garage = box(18, 8, 14, 0xb85a3a, 125, 4, -125, { shadow: true });
  group.add(garage);
  colliders.push({ minX: 115, maxX: 135, minZ: -133, maxZ: -117 });

  scene.add(group);
  return { group, colliders };
}

function buildPark(group, cx, cz, rng) {
  const lawn = new THREE.Mesh(
    new THREE.PlaneGeometry(BLOCK_SIZE - 4, BLOCK_SIZE - 4),
    new THREE.MeshLambertMaterial({ color: 0x6fae56 }),
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(cx, 0.06, cz);
  lawn.receiveShadow = true;
  group.add(lawn);
  for (let i = 0; i < 3; i++) {
    group.add(buildPalm(cx + (rng() - 0.5) * 24, cz + (rng() - 0.5) * 24, rng));
  }
}

function buildPalm(x, z, rng) {
  const g = new THREE.Group();
  const lean = (rng() - 0.5) * 0.25;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.34, 6.5, 7),
    new THREE.MeshLambertMaterial({ color: 0x8a6a44 }),
  );
  trunk.position.y = 3.25;
  trunk.rotation.z = lean;
  trunk.castShadow = true;
  g.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.2, 5), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.6 + lean * 6, 6.6, Math.sin(a) * 1.6);
    leaf.rotation.z = Math.cos(a) * 1.1;
    leaf.rotation.x = -Math.sin(a) * 1.1;
    leaf.castShadow = true;
    g.add(leaf);
  }
  g.position.set(x, 0, z);
  return g;
}

function buildBoat(rng) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(3, 1.2, 9),
    new THREE.MeshLambertMaterial({ color: [0xe8e8e8, 0x5aa8e8, 0xe86a5a][Math.floor(rng() * 3)] }),
  );
  hull.position.y = 0.6;
  hull.castShadow = true;
  g.add(hull);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2, 1.4, 3),
    new THREE.MeshLambertMaterial({ color: 0xf0f0e8 }),
  );
  cabin.position.set(0, 1.9, -0.5);
  g.add(cabin);
  return g;
}

// Point-in-collider test used by the player, cars and pedestrians.
export function hitsCollider(colliders, x, z, radius) {
  for (const c of colliders) {
    if (x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ) {
      return c;
    }
  }
  return null;
}

// Push a circle out of a collider (axis of least penetration).
export function resolveCollision(colliders, pos, radius) {
  const c = hitsCollider(colliders, pos.x, pos.z, radius);
  if (!c) return false;
  const dxl = pos.x + radius - c.minX;
  const dxr = c.maxX - (pos.x - radius);
  const dzl = pos.z + radius - c.minZ;
  const dzr = c.maxZ - (pos.z - radius);
  const m = Math.min(dxl, dxr, dzl, dzr);
  if (m === dxl) pos.x = c.minX - radius;
  else if (m === dxr) pos.x = c.maxX + radius;
  else if (m === dzl) pos.z = c.minZ - radius;
  else pos.z = c.maxZ + radius;
  return true;
}
