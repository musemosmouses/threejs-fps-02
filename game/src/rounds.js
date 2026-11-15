// Rounds: the match state machine — buy phase, live round, bomb plant /
// defuse / detonation, elimination and timeout wins, economy and the
// score. The player and the bots share one economy and one bomb.
import { GAME } from './config.js';
import { MAP } from './map.js';
import { clamp } from './rng.js';

export function createRounds(ctx) {
  const { player, bots, combat, audio, hud, rng } = ctx;

  const state = {
    phase: 'menu', // menu | buy | live | end | match
    round: 0,
    score: { ember: 0, ashen: 0 },
    timer: 0,
    buyTimer: 0,
    endTimer: 0,
    endReason: '',
    winner: null,
    lossStreak: { ember: 0, ashen: 0 },
    bomb: {
      holder: null, // fighter carrying the charge
      dropped: null, // {x, z} when the carrier died
      planted: false,
      site: null,
      fuse: 0,
      plantProgress: 0,
      defuseProgress: 0,
      planter: null,
      defuser: null,
    },
    matchWinner: null,
  };

  function fighters() {
    return bots.bots.concat([ctx.playerFighter]);
  }

  function aliveOf(team) {
    return fighters().filter((f) => f.alive && f.team === team);
  }

  function startMatch() {
    state.score.ember = 0;
    state.score.ashen = 0;
    state.round = 0;
    state.lossStreak.ember = 0;
    state.lossStreak.ashen = 0;
    for (const f of fighters()) {
      f.money = GAME.startMoney;
      f.kills = 0; f.deaths = 0;
    }
    startRound();
  }

  function startRound() {
    state.round += 1;
    state.phase = 'buy';
    state.buyTimer = GAME.buyTime;
    state.timer = GAME.roundTime;
    state.endTimer = 0;
    state.endReason = '';
    const b = state.bomb;
    b.planted = false; b.site = null; b.fuse = 0;
    b.plantProgress = 0; b.defuseProgress = 0;
    b.planter = null; b.defuser = null; b.dropped = null;
    // Reset everyone to spawn with full health; loadouts persist.
    bots.reset(state.round, rng);
    const spawn = MAP.spawns.ember[2];
    player.reset(spawn, 0);
    // Armor persists as-is from the previous round; buying refills it.
    // Bots buy with their money.
    bots.buy(rng);
    // Pick the bomb carrier: a random living attacker bot.
    const carriers = bots.emberBots.filter((x) => x.alive);
    b.holder = carriers[Math.floor(rng() * carriers.length)] || null;
    bots.assignPlan(rng);
    hud.showBanner(`ROUND ${state.round}`, 'Plant the charge at A or B — or clear the site.', 2.5);
    // Buy menu opens from main.js, which owns the lock + menu state.
  }

  function award(team, amount) {
    for (const f of fighters()) {
      if (f.team === team && f.alive) f.money += amount;
    }
  }

  function endRound(winner, reason) {
    if (state.phase === 'end' || state.phase === 'match') return;
    state.phase = 'end';
    state.endTimer = 4.5;
    state.endReason = reason;
    state.winner = winner;
    state.score[winner] += 1;
    const loser = winner === 'ember' ? 'ashen' : 'ember';
    const streak = (state.lossStreak[loser] += 1);
    state.lossStreak[winner] = 0;
    const lossPay = Math.min(GAME.lossStreakCap, GAME.lossReward + (streak - 1) * GAME.lossStreakBonus);
    award(winner, GAME.winReward);
    award(loser, lossPay);
    const playerWon = winner === 'ember';
    hud.showBanner(
      playerWon ? 'ROUND WON' : 'ROUND LOST',
      `${reason} — Embers ${state.score.ember} : ${state.score.ashen} Ashen`,
      4,
    );
    if (playerWon) audio.roundWin(); else audio.roundLose();
    hud.setBuyOpen(false);
    if (state.score[winner] >= GAME.roundsToWin || state.round >= GAME.maxRounds) {
      state.matchWinner = state.score.ember > state.score.ashen ? 'ember' : 'ashen';
    }
  }

  function siteAt(x, z) {
    for (const [key, s] of Object.entries(MAP.sites)) {
      if (Math.hypot(x - s.cx, z - s.cz) <= s.r) return key;
    }
    return null;
  }

  function step(dt, now, keys) {
    const b = state.bomb;
    if (state.phase === 'buy') {
      state.buyTimer -= dt;
      if (state.buyTimer <= 0) {
        state.phase = 'live';
        hud.setBuyOpen(false);
        hud.showBanner('GO GO GO', 'Charge is live. Take a site.', 1.6);
      }
      return;
    }
    if (state.phase === 'end') {
      state.endTimer -= dt;
      if (state.endTimer <= 0) {
        if (state.matchWinner) {
          state.phase = 'match';
          const won = state.matchWinner === 'ember';
          hud.showBanner(
            won ? 'CINDERGATE TAKEN' : 'CINDERGATE LOST',
            `Final — Embers ${state.score.ember} : ${state.score.ashen} Ashen. Press R to play again.`,
            999,
          );
        } else {
          startRound();
        }
      }
      return;
    }
    if (state.phase !== 'live') return;

    // --- bomb pickup: attackers walk over a dropped charge ---
    if (!b.planted && !b.holder && b.dropped) {
      for (const f of fighters()) {
        if (f.alive && f.team === 'ember' && Math.hypot(f.pos.x - b.dropped.x, f.pos.z - b.dropped.z) < 1.2) {
          b.holder = f;
          b.dropped = null;
          if (f === ctx.playerFighter) hud.flashObjective('You picked up the charge. Plant it at A or B.');
          break;
        }
      }
    }
    // Carrier died: drop the charge where they fell.
    if (!b.planted && b.holder && !b.holder.alive) {
      b.dropped = { x: b.holder.pos.x, z: b.holder.pos.z };
      b.holder = null;
    }

    // --- planting ---
    const planter = b.planted ? null : pickPlanter(keys);
    if (planter) {
      b.plantProgress += dt;
      b.planter = planter;
      if (Math.floor(b.plantProgress * 4) !== Math.floor((b.plantProgress - dt) * 4)) audio.plantTick();
      if (b.plantProgress >= GAME.plantTime) {
        b.planted = true;
        b.site = siteAt(planter.pos.x, planter.pos.z);
        b.fuse = GAME.bombTime;
        b.plantProgress = 0;
        b.planter = null;
        if (planter === ctx.playerFighter || (planter.isBot && planter.team === 'ember')) {
          planter.money += GAME.plantReward;
        }
        hud.showBanner('CHARGE PLANTED', `Site ${b.site} — ${GAME.bombTime}s to detonation. Defend it.`, 3);
        audio.beep(true);
        // Defenders converge on the planted site.
        for (const bot of bots.ashenBots) {
          if (!bot.alive) continue;
          const s = MAP.sites[b.site];
          const tx = s.cx + (rng() - 0.5) * 5, tz = s.cz + (rng() - 0.5) * 5;
          bot.site = b.site;
          bots.routeTo(bot, tx, tz);
        }
      }
    } else {
      b.plantProgress = 0;
      b.planter = null;
    }

    // --- fuse / detonation ---
    if (b.planted) {
      b.fuse -= dt;
      if (Math.floor(b.fuse) !== Math.floor(b.fuse + dt)) audio.beep(b.fuse < 10);
      if (b.fuse <= 0) {
        audio.explosion();
        combat.spawnSparks({ x: MAP.sites[b.site].cx, y: 1.5, z: MAP.sites[b.site].cz }, 40, 0, 1, 0);
        endRound('ember', `Charge detonated at site ${b.site}`);
        return;
      }
      // --- defusing ---
      const defuser = pickDefuser(keys);
      if (defuser) {
        b.defuseProgress += dt;
        b.defuser = defuser;
        if (Math.floor(b.defuseProgress * 4) !== Math.floor((b.defuseProgress - dt) * 4)) audio.defuseTick();
        if (b.defuseProgress >= GAME.defuseTime) {
          b.defuseProgress = 0;
          b.defuser = null;
          endRound('ashen', `Charge defused at site ${b.site}`);
          return;
        }
      } else {
        b.defuseProgress = 0;
        b.defuser = null;
      }
    }

    // --- round timer / elimination ---
    state.timer -= dt;
    const emberAlive = aliveOf('ember').length;
    const ashenAlive = aliveOf('ashen').length;
    if (emberAlive === 0) { endRound('ashen', 'Embers eliminated'); return; }
    if (ashenAlive === 0) { endRound('ember', 'Ashen eliminated'); return; }
    if (state.timer <= 0 && !b.planted) { endRound('ashen', 'Time expired — charge never planted'); return; }
    if (state.timer <= 0) state.timer = 0;
  }

  // Who is planting right now? Player holding E in a site with the charge,
  // or the carrier bot standing in its site with no enemy in sight.
  function pickPlanter(keys) {
    const b = state.bomb;
    const pf = ctx.playerFighter;
    if (pf.alive && b.holder === pf && keys.has('KeyE')) {
      const site = siteAt(pf.pos.x, pf.pos.z);
      if (site) return pf;
    }
    if (b.holder && b.holder.isBot && b.holder.alive) {
      const site = siteAt(b.holder.pos.x, b.holder.pos.z);
      if (site && !b.holder.target) {
        b.holder.planting = true;
        return b.holder;
      }
      b.holder.planting = false;
    }
    return null;
  }

  function pickDefuser(keys) {
    const b = state.bomb;
    if (!b.planted) return null;
    const pf = ctx.playerFighter;
    // Player is always Ember (attacker): the player never defuses.
    void pf; void keys;
    for (const bot of bots.ashenBots) {
      if (!bot.alive) continue;
      const site = siteAt(bot.pos.x, bot.pos.z);
      if (site === b.site && !bot.target) {
        bot.defusing = true;
        return bot;
      }
      bot.defusing = false;
    }
    return null;
  }

  return {
    state,
    startMatch,
    startRound,
    endRound,
    step,
    siteAt,
    aliveOf,
    fighters,
  };
}
