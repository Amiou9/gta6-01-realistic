// Sound, synthesized live with WebAudio: the engine hum, the two-tone siren, gunshots, thuds
// and the city's low wind. Nothing is loaded from anywhere. The context starts on the first
// click or keypress, as browsers require.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let noiseBuffer = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);

    // Engine: two detuned saws through a low-pass, pitch follows speed.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'square';
    engineOsc2.frequency.value = 28;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineOsc2.start();

    // Siren: a sine whose pitch swings between two tones on a slow square wave.
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.value = 820;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 190;
    lfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    lfo.start();

    // One second of noise, reused for every burst: shots, thuds, crashes.
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;

    // The city's breath: looped brown noise, barely there.
    const ambient = ctx.createBufferSource();
    ambient.buffer = noiseBuffer;
    ambient.loop = true;
    const ambientFilter = ctx.createBiquadFilter();
    ambientFilter.type = 'lowpass';
    ambientFilter.frequency.value = 240;
    const ambientGain = ctx.createGain();
    ambientGain.gain.value = 0.018;
    ambient.connect(ambientFilter);
    ambientFilter.connect(ambientGain);
    ambientGain.connect(master);
    ambient.start();
    return true;
  }

  function burst(duration, filterFreq, volume, when = 0) {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    const t = ctx.currentTime + when;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  function blip(freq, duration, volume, when = 0) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    const t = ctx.currentTime + when;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  return {
    ensure,
    get muted() { return muted; },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.9;
    },
    /** Called every frame: engine follows the car, the siren follows the nearest patrol. */
    update(state) {
      if (!ctx) return;
      const inCar = state.inCar;
      const speed = Math.abs(state.speed);
      engineOsc.frequency.value = 52 + speed * 3.4 + (state.throttle ? 10 : 0);
      engineOsc2.frequency.value = 26 + speed * 1.7;
      engineGain.gain.value = inCar ? 0.02 + speed * 0.0012 + (state.throttle ? 0.02 : 0) : 0;
      sirenGain.gain.value = state.siren ? Math.max(0, 0.05 - state.sirenDist * 0.0006) : 0;
    },
    shot() { burst(0.14, 2400, 0.5); blip(110, 0.12, 0.4); },
    punch() { burst(0.09, 500, 0.4); },
    crash() { burst(0.25, 700, 0.5); blip(70, 0.2, 0.4); },
    ram() { burst(0.18, 900, 0.45); },
    pickup() { blip(880, 0.12, 0.25); blip(1318, 0.18, 0.25, 0.1); },
    click() { blip(660, 0.06, 0.2); },
    busted() { blip(220, 0.5, 0.3); blip(165, 0.7, 0.3, 0.25); },
  };
}
