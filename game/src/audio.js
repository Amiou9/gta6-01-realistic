// MERIDIAN BAY — synthesized audio. Everything is WebAudio oscillators and
// filtered noise; there are no audio files and no network requests. The
// context is created on the first user gesture; M toggles mute.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let windSrc = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine: a low sawtooth whose pitch follows the car's speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a triangle that alternates between two notes.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      // Wind: looped brown-ish noise through a lowpass, very quiet.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3;
      }
      windSrc = ctx.createBufferSource();
      windSrc.buffer = buf;
      windSrc.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.value = 320;
      const windGain = ctx.createGain();
      windGain.gain.value = 0.05;
      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSrc.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  function noiseBurst(dur, vol, freq) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    get ready() { return !!ctx; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get isMuted() { return muted; },
    // Per-frame: engine pitch by speed, siren wail while wanted.
    update(dt, speed, wanted) {
      if (!ctx || muted) return;
      if (engineOsc) {
        engineOsc.frequency.value = 50 + Math.abs(speed) * 3.2;
        engineGain.gain.value = Math.abs(speed) > 0.5 ? 0.05 + Math.min(0.06, Math.abs(speed) * 0.0015) : 0;
      }
      if (sirenOsc) {
        sirenGain.gain.value = wanted > 0 ? 0.035 : 0;
        if (wanted > 0) {
          sirenTimer += dt;
          sirenOsc.frequency.value = Math.floor(sirenTimer * 1.6) % 2 === 0 ? 720 : 960;
        }
      }
    },
    shoot() { noiseBurst(0.12, 0.5, 2400); blip(190, 0.08, 'square', 0.25, 70); },
    punch() { noiseBurst(0.09, 0.35, 500); },
    crash() { noiseBurst(0.25, 0.45, 700); },
    pickup() { blip(660, 0.12, 'sine', 0.3); blip(990, 0.18, 'sine', 0.3); },
    missionDone() {
      blip(523, 0.14, 'sine', 0.3); setTimeout(() => blip(659, 0.14, 'sine', 0.3), 130);
      setTimeout(() => blip(784, 0.3, 'sine', 0.35), 260);
    },
    fail() { blip(320, 0.35, 'sawtooth', 0.25, 140); },
    busted() { blip(440, 0.25, 'square', 0.3, 220); setTimeout(() => blip(330, 0.4, 'square', 0.3, 165), 220); },
    click() { blip(880, 0.05, 'sine', 0.2); },
    reload() { blip(300, 0.06, 'square', 0.18); setTimeout(() => blip(420, 0.06, 'square', 0.18), 120); },
  };
}
