// Weapons: loadouts, firing cadence, spread bloom, reloads, and grenade
// throws. A fighter (player or bot) carries this state; combat.js turns a
// fired round into a hitscan. Times are in seconds, `now` is sim time.
import { WEAPONS, GRENADES, ARMOR_PRICE } from './config.js';

// A fresh loadout: pistol owned, rifle slot empty, no armor, one frag.
export function freshLoadout() {
  return {
    weapons: { p8: { mag: WEAPONS.p8.mag, reserve: WEAPONS.p8.reserve } },
    current: 'p8',
    grenades: { frag: 1, smoke: 0, flash: 0 },
    armor: 0,
    nextShotAt: 0,
    reloadUntil: 0,
    reloading: null,
    bloom: 0,
    lastFiredAt: -10,
  };
}

export function giveWeapon(loadout, key) {
  const def = WEAPONS[key];
  if (!def) return false;
  if (loadout.weapons[key]) {
    // Top up reserve on a rebuy.
    loadout.weapons[key].reserve = def.reserve;
    return true;
  }
  loadout.weapons[key] = { mag: def.mag, reserve: def.reserve };
  return true;
}

export function currentDef(loadout) {
  return WEAPONS[loadout.current];
}

export function canFire(loadout, now) {
  if (loadout.reloading) return false;
  if (now < loadout.nextShotAt) return false;
  const slot = loadout.weapons[loadout.current];
  return slot && slot.mag > 0;
}

export function fire(loadout, now) {
  const def = WEAPONS[loadout.current];
  const slot = loadout.weapons[loadout.current];
  if (!slot || slot.mag <= 0) return null;
  slot.mag -= 1;
  loadout.nextShotAt = now + 60 / def.rof;
  loadout.lastFiredAt = now;
  loadout.bloom = Math.min(1, loadout.bloom + def.bloom * 3);
  return def;
}

export function startReload(loadout, now) {
  const def = WEAPONS[loadout.current];
  const slot = loadout.weapons[loadout.current];
  if (!slot || loadout.reloading) return false;
  if (slot.mag >= def.mag || slot.reserve <= 0) return false;
  loadout.reloading = loadout.current;
  loadout.reloadUntil = now + def.reload;
  return true;
}

export function updateReload(loadout, now) {
  if (!loadout.reloading) return false;
  if (now < loadout.reloadUntil) return false;
  const key = loadout.reloading;
  const def = WEAPONS[key];
  const slot = loadout.weapons[key];
  if (slot) {
    const need = def.mag - slot.mag;
    const take = Math.min(need, slot.reserve);
    slot.mag += take;
    slot.reserve -= take;
  }
  loadout.reloading = null;
  return true;
}

export function switchTo(loadout, key, now) {
  if (!loadout.weapons[key] || loadout.current === key) return false;
  loadout.current = key;
  loadout.reloading = null;
  loadout.nextShotAt = Math.max(loadout.nextShotAt, now + 0.25);
  return true;
}

// Spread in radians for this shot: base + movement + air + bloom.
export function spreadFor(loadout, def, groundSpeed, airborne, ads, crouched) {
  let spread = def.spread;
  spread += def.moveSpread * Math.min(1, groundSpeed / 5.5);
  if (airborne) spread += 0.03;
  if (crouched) spread *= 0.7;
  if (ads) spread *= def.zoom > 1 ? 0.45 : 0.7;
  spread += loadout.bloom * 0.02;
  return spread;
}

export function decayBloom(loadout, dt) {
  loadout.bloom = Math.max(0, loadout.bloom - dt * 1.4);
}

// Buy menu catalogue: rows the HUD renders, each with a price and an
// apply function. `f` is the fighter buying, `game` carries money rules.
export const SHOP = [
  { id: 'rasp', label: 'RASP SMG', price: WEAPONS.rasp.price, desc: 'Fast, close. 32 rounds.' },
  { id: 'mauler', label: 'MAULER-12', price: WEAPONS.mauler.price, desc: '8 pellets, roomsweeper.' },
  { id: 'anvil', label: 'ANVIL VK-47', price: WEAPONS.anvil.price, desc: 'The workhorse rifle.' },
  { id: 'longshot', label: 'LONGSHOT', price: WEAPONS.longshot.price, desc: 'One shot, one echo.' },
  { id: 'armor', label: 'Plate Vest', price: ARMOR_PRICE, desc: 'Absorbs half the damage.' },
  { id: 'frag', label: 'Frag Charge', price: GRENADES.frag.price, desc: 'Cook it, bank it.' },
  { id: 'smoke', label: 'Smoke Canister', price: GRENADES.smoke.price, desc: '14 s of cover.' },
  { id: 'flash', label: 'Flash Cell', price: GRENADES.flash.price, desc: 'Blind the angle.' },
  { id: 'ammo', label: 'Full Ammo', price: 200, desc: 'Refill every reserve.' },
];

export function buyItem(loadout, money, id) {
  const item = SHOP.find((s) => s.id === id);
  if (!item || money < item.price) return { ok: false, money };
  if (id === 'armor') {
    if (loadout.armor >= 100) return { ok: false, money };
    loadout.armor = 100;
  } else if (id === 'ammo') {
    for (const key of Object.keys(loadout.weapons)) {
      loadout.weapons[key].reserve = WEAPONS[key].reserve;
    }
  } else if (id === 'frag' || id === 'smoke' || id === 'flash') {
    if (loadout.grenades[id] >= 2) return { ok: false, money };
    loadout.grenades[id] += 1;
  } else {
    giveWeapon(loadout, id);
    loadout.current = id;
  }
  return { ok: true, money: money - item.price };
}

// Grenade throw: initial velocity from the fighter's view direction.
export function throwVelocity(dir, up = 0.35) {
  const speed = 13;
  return { x: dir.x * speed, y: dir.y * speed + up * speed * 0.4 + 2.2, z: dir.z * speed };
}
