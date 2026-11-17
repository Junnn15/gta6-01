// SOLMAR HEAT — save.js
// One clear job: persist the player's progress in localStorage and read
// it back. Money, mission index, health and position — nothing else.
// A corrupt or missing save is treated as "no save", never an error.

const SAVE_KEY = 'solmar-heat-save-v1';

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      savedAt: Date.now(),
      money: state.money,
      missionIndex: state.missionIndex,
      health: state.health,
      playerX: state.playerX,
      playerZ: state.playerZ,
      playerHeading: state.playerHeading,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return {
      money: typeof data.money === 'number' ? data.money : 0,
      missionIndex: typeof data.missionIndex === 'number' ? data.missionIndex : 0,
      health: typeof data.health === 'number' ? data.health : 100,
      playerX: typeof data.playerX === 'number' ? data.playerX : 0,
      playerZ: typeof data.playerZ === 'number' ? data.playerZ : 30,
      playerHeading: typeof data.playerHeading === 'number' ? data.playerHeading : 0,
    };
  } catch (e) {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    // ignore
  }
}
