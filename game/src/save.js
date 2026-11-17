// Save / load through localStorage: mission progress, cash, health, the
// player's position and the time of day. Autosaves on mission completion and
// every 30 seconds; the title screen offers Continue when a save exists.

import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      savedAt: Date.now(),
      missionIndex: state.missionIndex,
      cash: state.cash,
      health: state.health,
      x: state.x,
      z: state.z,
      heading: state.heading,
      wanted: state.wanted,
      storyDone: state.storyDone,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}
