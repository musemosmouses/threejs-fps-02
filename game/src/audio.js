// Procedural sound: every effect is synthesised with WebAudio, no files.
// A tiny synth per sound keeps the game fully offline and asset-free.
export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function noiseBuffer(seconds) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function burst(dur, filterFreq, gain, type = 'lowpass', when = 0) {
    if (!enabled || !ensure()) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, gain, type = 'sine', slideTo = null, when = 0) {
    if (!enabled || !ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  const WEAPON_SOUND = {
    pistol: () => { burst(0.09, 1800, 0.5); tone(160, 0.07, 0.3, 'square', 70); },
    smg: () => { burst(0.06, 2400, 0.34); tone(210, 0.05, 0.2, 'square', 90); },
    shotgun: () => { burst(0.22, 900, 0.7); tone(110, 0.16, 0.4, 'square', 45); },
    rifle: () => { burst(0.11, 1500, 0.55); tone(140, 0.09, 0.32, 'square', 60); },
    sniper: () => { burst(0.3, 700, 0.8); tone(90, 0.22, 0.45, 'sawtooth', 40); },
  };

  return {
    unlock() { ensure(); },
    setEnabled(v) { enabled = v; },
    shot(kind, dist = 0) {
      const fn = WEAPON_SOUND[kind] || WEAPON_SOUND.rifle;
      fn();
      if (dist > 25) {
        // Distant crack: quieter, delayed by distance.
        setTimeout(() => burst(0.08, 900, 0.12), Math.min(300, dist * 3));
      }
    },
    dryFire() { tone(1200, 0.03, 0.12, 'square'); },
    reload() {
      tone(900, 0.03, 0.1, 'square');
      setTimeout(() => tone(650, 0.03, 0.1, 'square'), 180);
      setTimeout(() => tone(1100, 0.04, 0.12, 'square'), 420);
    },
    step(run) { burst(0.05, 500, run ? 0.1 : 0.06); },
    hit(kill) {
      tone(kill ? 1500 : 1100, 0.06, 0.16, 'sine');
      if (kill) setTimeout(() => tone(1900, 0.08, 0.14, 'sine'), 70);
    },
    hurt() { tone(220, 0.12, 0.25, 'sawtooth', 110); },
    plantTick() { tone(1400, 0.05, 0.14, 'square'); },
    beep(urgent) { tone(urgent ? 1750 : 1250, 0.09, 0.2, 'square'); },
    defuseTick() { tone(950, 0.05, 0.12, 'square'); },
    explosion() {
      burst(0.9, 300, 0.9);
      tone(70, 0.7, 0.5, 'sine', 30);
    },
    roundWin() {
      tone(523, 0.12, 0.18, 'triangle');
      setTimeout(() => tone(659, 0.12, 0.18, 'triangle'), 120);
      setTimeout(() => tone(784, 0.22, 0.2, 'triangle'), 240);
    },
    roundLose() {
      tone(392, 0.14, 0.18, 'triangle');
      setTimeout(() => tone(330, 0.14, 0.18, 'triangle'), 140);
      setTimeout(() => tone(262, 0.26, 0.2, 'triangle'), 280);
    },
    buy() { tone(880, 0.06, 0.14, 'sine'); setTimeout(() => tone(1320, 0.08, 0.12, 'sine'), 60); },
    click() { tone(700, 0.03, 0.08, 'square'); },
    flash() { tone(2400, 0.5, 0.1, 'sine', 900); },
    smoke() { burst(0.7, 600, 0.14, 'bandpass'); },
  };
}
