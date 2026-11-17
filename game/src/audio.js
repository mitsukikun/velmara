// All sound is synthesised with WebAudio: engine hum, sirens, gunshots, pickups
// and a looping bass groove. Nothing is loaded from a file. The context is
// created on the first user gesture; until then every call is a safe no-op.

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicTimer = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let musicOn = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, lowpass) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass || 1200;
    const g = ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
  }

  const api = {
    unlock() { ensure(); },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
      if (muted) api.engine(0);
    },
    isMuted() { return muted; },

    click() { tone(660, 0.07, 'square', 0.12); },
    pickup() { tone(880, 0.1, 'sine', 0.2); setTimeout(() => tone(1320, 0.14, 'sine', 0.18), 70); },
    cash() {
      tone(988, 0.09, 'triangle', 0.22);
      setTimeout(() => tone(1319, 0.09, 'triangle', 0.22), 80);
      setTimeout(() => tone(1568, 0.16, 'triangle', 0.22), 160);
    },
    mission() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.2), i * 110));
    },
    fail() { tone(220, 0.4, 'sawtooth', 0.18, 110); },
    hit() { noise(0.08, 0.25, 900); },
    punch() { noise(0.1, 0.35, 500); tone(120, 0.1, 'sine', 0.3, 60); },
    shot() {
      noise(0.16, 0.5, 2800);
      tone(180, 0.12, 'square', 0.25, 50);
    },
    explosion() {
      noise(0.7, 0.7, 400);
      tone(90, 0.6, 'sine', 0.5, 30);
    },
    crash() { noise(0.25, 0.4, 700); tone(70, 0.2, 'sine', 0.35, 40); },
    wantedUp() { tone(440, 0.15, 'square', 0.16); setTimeout(() => tone(587, 0.2, 'square', 0.16), 130); },
    busted() { tone(330, 0.3, 'sawtooth', 0.2, 165); setTimeout(() => tone(220, 0.5, 'sawtooth', 0.2, 110), 250); },

    /** Continuous engine hum; level 0 silences it. */
    engine(level) {
      if (!ensure() || muted) {
        if (engineOsc) { try { engineOsc.stop(); } catch { /* already stopped */ } engineOsc = null; }
        return;
      }
      if (level <= 0.01) {
        if (engineGain) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.setTargetAtTime(55 + level * 130, ctx.currentTime, 0.08);
      engineGain.gain.setTargetAtTime(0.05 + level * 0.07, ctx.currentTime, 0.1);
    },

    /** Two-tone police siren; call siren(false) to stop. */
    siren(on) {
      if (!ensure() || muted || !on) {
        if (sirenOsc) { try { sirenOsc.stop(); } catch { /* already stopped */ } sirenOsc = null; }
        return;
      }
      if (sirenOsc) return;
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.045;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.9;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenOsc.frequency.value = 750;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      lfo.start();
      sirenOsc._lfo = lfo;
    },

    /** A laid-back synth groove: bass line + hats, scheduled in 8th-note steps. */
    startMusic() {
      if (musicOn || !ensure()) return;
      musicOn = true;
      const bassLine = [55, 0, 55, 65.4, 0, 55, 49, 58.3, 55, 0, 55, 65.4, 82.4, 73.4, 65.4, 49];
      let step = 0;
      const stepDur = 0.24;
      function schedule() {
        if (!musicOn) return;
        const f = bassLine[step % bassLine.length];
        if (f && !muted) tone(f, stepDur * 0.9, 'triangle', 0.14);
        if (step % 2 === 0 && !muted) noise(0.03, 0.05, 6000);
        step += 1;
        musicTimer = setTimeout(schedule, stepDur * 1000);
      }
      schedule();
    },
    stopMusic() {
      musicOn = false;
      if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
    },
  };
  return api;
}
