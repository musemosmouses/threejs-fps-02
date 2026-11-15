// CINDERGATE — shared tuning: teams, economy, weapons, rounds.
// One place for every number the game balances on, so the sim, the bots
// and the HUD all read the same truth.
export const GAME = {
  name: 'CINDERGATE',
  subtitle: 'Foundry Row — 5v5 tactical FPS',
  teams: {
    ember: { name: 'EMBERS', short: 'EMB', color: 0xf07830, css: '#f07830', spawn: 'south' },
    ashen: { name: 'ASHEN', short: 'ASH', color: 0x6f9fb8, css: '#6f9fb8', spawn: 'north' },
  },
  playersPerTeam: 5,
  roundsToWin: 5,
  maxRounds: 9,
  roundTime: 100, // seconds
  buyTime: 12, // seconds of buy phase at round start
  freezeTime: 3, // seconds frozen before the round timer starts
  bombTime: 35, // fuse after plant
  plantTime: 3.2, // seconds holding E at a site
  defuseTime: 5.0, // seconds holding E on a planted charge
  startMoney: 800,
  killReward: 300,
  plantReward: 300,
  winReward: 3250,
  lossReward: 1900,
  lossStreakBonus: 500,
  lossStreakCap: 2900,
};

export const WEAPONS = {
  p8: {
    name: 'P8 Sidearm', kind: 'pistol', price: 0, auto: false,
    damage: 34, headMult: 4, rof: 360, mag: 12, reserve: 36,
    spread: 0.011, moveSpread: 0.02, bloom: 0.006, recoil: 0.011,
    reload: 1.5, range: 60, zoom: 1,
  },
  rasp: {
    name: 'RASP SMG', kind: 'smg', price: 1500, auto: true,
    damage: 26, headMult: 4, rof: 750, mag: 32, reserve: 96,
    spread: 0.014, moveSpread: 0.026, bloom: 0.004, recoil: 0.008,
    reload: 2.0, range: 45, zoom: 1,
  },
  mauler: {
    name: 'MAULER-12', kind: 'shotgun', price: 2000, auto: false,
    damage: 22, pellets: 8, headMult: 2, rof: 70, mag: 6, reserve: 24,
    spread: 0.05, moveSpread: 0.05, bloom: 0.02, recoil: 0.05,
    reload: 2.6, range: 22, zoom: 1,
  },
  anvil: {
    name: 'ANVIL VK-47', kind: 'rifle', price: 2700, auto: true,
    damage: 36, headMult: 4, rof: 600, mag: 30, reserve: 90,
    spread: 0.008, moveSpread: 0.02, bloom: 0.005, recoil: 0.013,
    reload: 2.2, range: 80, zoom: 1.25,
  },
  longshot: {
    name: 'LONGSHOT', kind: 'sniper', price: 4750, auto: false,
    damage: 110, headMult: 4, rof: 48, mag: 5, reserve: 15,
    spread: 0.001, moveSpread: 0.05, bloom: 0.03, recoil: 0.06,
    reload: 3.2, range: 120, zoom: 2.4,
  },
};

export const GRENADES = {
  frag: { name: 'Frag Charge', price: 300, fuse: 2.5, radius: 14, maxDamage: 110 },
  smoke: { name: 'Smoke Canister', price: 300, duration: 14, radius: 5.5 },
  flash: { name: 'Flash Cell', price: 200, fuse: 1.4, radius: 22 },
};

export const ARMOR_PRICE = 650;
export const ARMOR_ABSORB = 0.5; // fraction of damage armor takes first

// Player body: AABB half extents and eye heights (metres).
export const BODY = {
  halfW: 0.34,
  height: 1.8,
  eyeStand: 1.62,
  eyeCrouch: 1.12,
  walkSpeed: 4.6,
  runSpeed: 5.6,
  crouchSpeed: 2.4,
  adsSpeed: 3.1,
  accel: 42,
  friction: 30,
  jumpSpeed: 5.2,
  gravity: 14,
  stepUp: 0.55, // auto step-up height for low crates
};

// Bot tuning: reaction and aim scale with distance and target motion.
export const BOT = {
  reactionMin: 0.28,
  reactionMax: 0.5,
  aimErrorBase: 0.012, // radians of aim error at 10 m, standing still
  aimErrorPerMetre: 0.0009,
  aimErrorMoving: 0.02,
  burstMin: 3,
  burstMax: 6,
  burstPause: 0.45,
  hearRadius: 34, // gunshots heard this far
  seeDistance: 55,
  fovCos: 0.55, // cos of half-FOV (~57 deg half-angle)
  walkSpeed: 4.2,
  strafeChance: 0.35,
};
