// SOLMAR HEAT — shots.js
// One clear job: deterministic staging for screenshots and headless
// play-tests. ?shot=<name>&seed=1 sets the game to a known, readable
// state (start screen, cover chase, street life, police chase) so every
// screenshot is a real render of a staged moment, never a composite.
// Also exposes window.__solmar, a small read-only probe the play-test
// harness uses to verify the game actually plays.

export function parseShotParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    shot: params.get('shot') || null,
    seed: Number(params.get('seed') || '1') || 1,
  };
}

// game is the Game instance from main.js. Returns true when a shot was staged.
export function stageShot(game, name) {
  if (!name) return false;
  game.audio.start();
  if (name === 'start') {
    game.toMenu();
    return true;
  }
  game.startGame({ skipIntro: true });
  if (name === 'street') {
    // On foot at the plaza: traffic and pedestrians in frame.
    game.teleportPlayer(-8, 24, Math.PI * 0.85);
    game.setCamera(2.6, 0.32);
    game.missions.start();
    game.missions.message = '';
    game.missions.messageTimer = 0;
    return true;
  }
  if (name === 'cover') {
    // The cover: Dario driving down the central avenue, wanted 3,
    // mission 2 (the boost) active, HUD + minimap + objective all live.
    game.missions.index = 1;
    game.missions.state = 'active';
    game.missions.pickedUp = true;
    game.missions._moveBeacon(125, -110);
    const car = game.spawnPlayerCar(0, -125, 0xd21f2b);
    game.enterCar(car, { silent: true });
    game.police.addCrime(3);
    game.police.crimeTimer = 0;
    game.teleportCar(0, -125, 0);
    game.setCamera(0, 0.28);
    game.carSpeedForShot(26);
    game.missions.message = '';
    game.missions.messageTimer = 0;
    return true;
  }
  if (name === 'chase') {
    // Police chase: wanted 4, two police cars closing in behind.
    game.missions.index = 2;
    game.missions.state = 'active';
    game.missions.pickedUp = true;
    game.missions.timeLeft = 62;
    game.missions.checkpointIndex = 1;
    game.missions._moveBeacon(125, 50);
    const car = game.spawnPlayerCar(0, 60, 0x2e6fc2);
    game.enterCar(car, { silent: true });
    game.police.addCrime(4);
    game.police.crimeTimer = 0;
    game.teleportCar(0, 60, 0);
    game.setCamera(0, 0.3);
    game.carSpeedForShot(24);
    game.missions.message = '';
    game.missions.messageTimer = 0;
    return true;
  }
  if (name === 'mission') {
    // The heist: Dario on foot at the Coral Bank, guards in frame.
    game.missions.index = 3;
    game.missions.state = 'active';
    game.missions.pickedUp = true;
    game.missions._spawnGuards(game.missions.current);
    game.missions.guardsLeft = game.missions.guards.length;
    game.missions._moveBeacon(25, 40);
    game.teleportPlayer(25, 52, Math.PI);
    game.setCamera(Math.PI, 0.3);
    game.missions.message = '';
    game.missions.messageTimer = 0;
    return true;
  }
  return false;
}

// Read-only probe for the headless play-test harness.
export function installProbe(game) {
  window.__solmar = {
    version: 1,
    game,
    state() {
      const focus = game.player.inCar && game.player.car ? game.player.car.pos : game.player.pos;
      return {
        gameState: game.state,
        money: game.money,
        debt: game.missions.debtRemaining,
        missionIndex: game.missions.index,
        missionState: game.missions.state,
        missionObjective: game.missions.objectiveText,
        wanted: game.police.stars,
        health: Math.round(game.player.health),
        ammo: game.combat.ammo,
        reserve: game.combat.reserve,
        inCar: game.player.inCar,
        speed: game.player.inCar ? game.player.car.speed : 0,
        playerX: Number(focus.x.toFixed(1)),
        playerZ: Number(focus.z.toFixed(1)),
        policeCars: game.police.cars.length,
        officers: game.police.officers.length,
        guardsLeft: game.missions.guardsLeft,
        trafficCars: game.traffic.cars.length,
        pedestrians: game.traffic.peds.length,
        errors: game.errorCount,
      };
    },
    teleport(x, z) {
      game.teleportPlayer(x, z, 0);
    },
    setWanted(n) {
      game.police.stars = n;
      game.police.crimeTimer = 0;
    },
    startMission(i) {
      game.missions.index = i;
      game.missions.state = 'idle';
      game.missions.start();
    },
    pressKey(code, down) {
      game.input.injectKey(code, down);
    },
    click() {
      game.input.mouseClicked = true;
    },
    look(dx, dy) {
      game.cameraYaw -= dx * 0.004;
      game.cameraPitch += dy * 0.003;
    },
    shotStaged: null,
  };
}
