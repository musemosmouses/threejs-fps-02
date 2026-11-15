// Screenshot staging: ?shot=buy|play|plant|end with &seed=N sets up a
// deterministic frame, renders it twice, then freezes and sets
// window.__shotReady. The game never waits for input in a shot.
import { MAP } from './map.js';

export function stageShot(mode, G) {
  const { player, playerFighter, bots, rounds, combat, hud, rng } = G;
  const st = rounds.state;

  // A fresh match, round 1, so every shot starts from the same state.
  rounds.startMatch();
  hud.hideOverlay();

  if (mode === 'buy') {
    // Spawn, buy menu open, yard ahead.
    player.state.pos.x = -4; player.state.pos.y = 0; player.state.pos.z = 20;
    player.state.yaw = 0; player.state.pitch = 0;
    playerFighter.money = 3250;
    hud.setBuyOpen(true, playerFighter.money, playerFighter.loadout);
    hud.hideBanner(); // the round banner would ghost behind the menu
    return;
  }

  if (mode === 'play') {
    // Mid doors, two Ashen in the open, one round already downrange.
    st.phase = 'live';
    st.timer = 62;
    player.state.pos.x = 0; player.state.pos.y = 0; player.state.pos.z = 4;
    player.state.yaw = 0.12; player.state.pitch = 0.06;
    player.state.hp = 82; player.state.armor = 50;
    const ash = bots.ashenBots;
    placeBot(ash[0], -5, -6, 0.4);
    placeBot(ash[1], 5, -8, -0.3);
    placeBot(bots.emberBots[0], -2.5, 4, 0.2);
    G.stepFixed(1 / 60);
    G.syncCamera();
    // Shoot last, with no step after: the tracer and muzzle flash are
    // at full strength when the frame is painted.
    G.playerShoot(0);
    return;
  }

  if (mode === 'plant') {
    // Charge planted at A, fuse running, defenders closing in.
    st.phase = 'live';
    st.timer = 41;
    st.bomb.planted = true;
    st.bomb.site = 'A';
    st.bomb.fuse = 24;
    st.bomb.holder = null;
    player.state.pos.x = -14; player.state.pos.y = 0; player.state.pos.z = -5;
    player.state.yaw = 0.9; player.state.pitch = 0.02;
    const carrier = bots.emberBots[1];
    placeBot(carrier, -22, -13, -0.6);
    carrier.crouched = true;
    placeBot(bots.ashenBots[0], -20, -5, 0.2);
    placeBot(bots.ashenBots[2], 2, -10, 0.9);
    hud.setBombStatus('CHARGE PLANTED — SITE A  0:24');
    hud.showBanner('CHARGE PLANTED', 'Site A — hold it.', 999);
    return;
  }

  // 'end': round won, banner up, a fallen Ashen in the foreground.
  st.phase = 'end';
  st.score.ember = 1;
  st.score.ashen = 0;
  st.endReason = 'Ashen eliminated';
  player.state.pos.x = -6; player.state.pos.y = 0; player.state.pos.z = 6;
  player.state.yaw = -0.35; player.state.pitch = 0.03;
  const dead = bots.ashenBots[1];
  placeBot(dead, -9, -2, 0.8);
  dead.alive = false;
  dead.hp = 0;
  dead.fallT = 1;
  dead.mesh.rotation.x = -Math.PI / 2;
  dead.mesh.position.set(dead.pos.x, 0.2, dead.pos.z);
  hud.showBanner('ROUND WON', 'Ashen eliminated — Embers 1 : 0 Ashen', 999);
  player.state.hp = 64; player.state.armor = 0;

  function placeBot(bot, x, z, yaw) {
    bot.pos.x = x; bot.pos.y = 0; bot.pos.z = z;
    bot.yaw = yaw;
    bot.path = []; bot.pathIdx = 0;
    bot.target = null;
    bot.mesh.position.set(x, 0, z);
    bot.mesh.rotation.set(0, yaw, 0);
  }
}
