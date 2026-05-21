// Web Audio API and Synthesizer sound generation

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
export const audioState = {
    isSfxEnabled: true,
    isSoundtrackPlaying: false,
    soundtrackVolume: 0.1
};

// Engine hum state
let engineOsc = null;
let engineGain = null;

export function startEngineHum() {
    if (!audioState.isSfxEnabled || engineOsc) return;
    try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        engineOsc = audioCtx.createOscillator();
        engineGain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 320;

        engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = 62;
        engineGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
        engineGain.gain.linearRampToValueAtTime(0.055, audioCtx.currentTime + 0.12);

        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(audioCtx.destination);
        engineOsc.start();
    } catch (e) {}
}

export function stopEngineHum() {
    if (!engineOsc) return;
    try {
        engineGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
        const osc = engineOsc;
        const gain = engineGain;
        engineOsc = null;
        engineGain = null;
        setTimeout(() => { try { osc.stop(); } catch (e) {} }, 220);
    } catch (e) {}
}

export function playSound(type, extra = {}) {
    if (!audioState.isSfxEnabled) return;
    try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const now = audioCtx.currentTime;

        // Build output chain: optionally add stereo panner for positional audio
        let dest = audioCtx.destination;
        if (extra.pan !== undefined) {
            const panner = audioCtx.createStereoPanner();
            panner.pan.value = Math.max(-1, Math.min(1, extra.pan));
            panner.connect(audioCtx.destination);
            dest = panner;
        }

        if (type === 'shoot') {
            const osc = audioCtx.createOscillator();
            const noise = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(320, now);
            osc.frequency.exponentialRampToValueAtTime(75, now + 0.38);

            noise.type = 'triangle';
            noise.frequency.setValueAtTime(110, now);
            noise.frequency.exponentialRampToValueAtTime(12, now + 0.22);

            gain.gain.setValueAtTime(0.42, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.42);

            osc.connect(gain); noise.connect(gain);
            gain.connect(dest);
            osc.start(now); noise.start(now);
            osc.stop(now + 0.42); noise.stop(now + 0.42);
        }
        else if (type === 'shell_casing') {
            // Short metallic tink - staggered for realism
            const delays = [0, 0.04, 0.09];
            delays.forEach(delay => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                const t = now + delay;
                const pitchVariant = 2200 + Math.random() * 600;
                osc.type = 'sine';
                osc.frequency.setValueAtTime(pitchVariant, t);
                osc.frequency.exponentialRampToValueAtTime(pitchVariant * 0.35, t + 0.07);
                gain.gain.setValueAtTime(0.055, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
                osc.connect(gain); gain.connect(dest);
                osc.start(t); osc.stop(t + 0.12);
            });
        }
        else if (type === 'charge') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            const pitch = 150 + (extra.power || 0) * 450;

            osc.type = 'sine';
            osc.frequency.setValueAtTime(pitch, now);

            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

            osc.connect(gain); gain.connect(dest);
            osc.start(now); osc.stop(now + 0.08);
        }
        else if (type === 'explosion') {
            // White noise burst
            const bufferSize = Math.floor(audioCtx.sampleRate * 0.85);
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;

            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            // Pitch variant: randomize cutoff start for each explosion
            const cutoffStart = 400 + Math.random() * 200;
            filter.frequency.setValueAtTime(cutoffStart, now);
            filter.frequency.exponentialRampToValueAtTime(14, now + 0.75);

            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(0.68, now);
            gain.gain.exponentialRampToValueAtTime(0.005, now + 0.85);

            noise.connect(filter); filter.connect(gain); gain.connect(dest);
            noise.start(now);

            // Sub-bass layer at ~40Hz for physical "felt" impact
            const subOsc = audioCtx.createOscillator();
            const subGain = audioCtx.createGain();
            subOsc.type = 'sine';
            subOsc.frequency.setValueAtTime(38 + Math.random() * 8, now);
            subOsc.frequency.exponentialRampToValueAtTime(22, now + 0.5);
            subGain.gain.setValueAtTime(0.55, now);
            subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
            subOsc.connect(subGain); subGain.connect(dest);
            subOsc.start(now); subOsc.stop(now + 0.6);

            // Mid crackle layer
            const crackOsc = audioCtx.createOscillator();
            const crackGain = audioCtx.createGain();
            crackOsc.type = 'sawtooth';
            crackOsc.frequency.setValueAtTime(180 + Math.random() * 60, now);
            crackOsc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
            crackGain.gain.setValueAtTime(0.22, now);
            crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            crackOsc.connect(crackGain); crackGain.connect(dest);
            crackOsc.start(now); crackOsc.stop(now + 0.4);
        }
        else if (type === 'shield_block') {
            // Resonant dome impact: cluster of harmonics
            const freqs = [180, 270, 360, 540];
            freqs.forEach((freq, i) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                const t = now + i * 0.015;
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, t);
                osc.frequency.exponentialRampToValueAtTime(freq * 0.7, t + 0.4);
                gain.gain.setValueAtTime(0.1 - i * 0.018, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
                osc.connect(gain); gain.connect(dest);
                osc.start(t); osc.stop(t + 0.55);
            });
            // Metallic shimmer
            const shimmer = audioCtx.createOscillator();
            const sGain = audioCtx.createGain();
            shimmer.type = 'triangle';
            shimmer.frequency.setValueAtTime(1400, now);
            shimmer.frequency.exponentialRampToValueAtTime(400, now + 0.35);
            sGain.gain.setValueAtTime(0.05, now);
            sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            shimmer.connect(sGain); sGain.connect(dest);
            shimmer.start(now); shimmer.stop(now + 0.45);
        }
        else if (type === 'move') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(85, now);
            osc.frequency.linearRampToValueAtTime(125, now + 0.1);
            gain.gain.setValueAtTime(0.14, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.connect(gain); gain.connect(dest);
            osc.start(now); osc.stop(now + 0.1);
        }
        else if (type === 'click') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(820, now);
            osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
            osc.connect(gain); gain.connect(dest);
            osc.start(now); osc.stop(now + 0.08);
        }
        else if (type === 'shield_deploy') {
            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            const lfo = audioCtx.createOscillator();
            const lfoGain = audioCtx.createGain();
            const gain = audioCtx.createGain();

            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(60, now);
            osc1.frequency.exponentialRampToValueAtTime(880, now + 1.5);

            osc2.type = 'sawtooth';
            osc2.frequency.setValueAtTime(40, now);
            osc2.frequency.exponentialRampToValueAtTime(220, now + 1.5);

            lfo.type = 'sine'; lfo.frequency.setValueAtTime(25, now);
            lfoGain.gain.setValueAtTime(15, now);

            gain.gain.setValueAtTime(0.01, now);
            gain.gain.linearRampToValueAtTime(0.3, now + 0.3);
            for (let t = 0.3; t < 1.3; t += 0.1)
                gain.gain.linearRampToValueAtTime(0.2 + Math.random() * 0.15, now + t);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

            lfo.connect(lfoGain);
            lfoGain.connect(osc1.frequency); lfoGain.connect(osc2.frequency);
            osc1.connect(gain); osc2.connect(gain); gain.connect(dest);

            lfo.start(now); osc1.start(now); osc2.start(now);
            lfo.stop(now + 1.5); osc1.stop(now + 1.5); osc2.stop(now + 1.5);
        }
        else if (type === 'wall_deploy') {
            const osc = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            const filter = audioCtx.createBiquadFilter();
            const gain = audioCtx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.exponentialRampToValueAtTime(350, now + 0.6);

            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(150, now);
            osc2.frequency.exponentialRampToValueAtTime(700, now + 0.6);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(200, now);
            filter.frequency.exponentialRampToValueAtTime(1800, now + 0.5);

            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);

            osc.connect(filter); osc2.connect(filter);
            filter.connect(gain); gain.connect(dest);
            osc.start(now); osc2.start(now);
            osc.stop(now + 0.8); osc2.stop(now + 0.8);
        }
        else if (type === 'add_deploy') {
            const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
            notes.forEach((freq, idx) => {
                const noteTime = now + idx * 0.06;
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, noteTime);
                osc.frequency.exponentialRampToValueAtTime(freq * 1.5, noteTime + 0.15);
                gain.gain.setValueAtTime(0.12, noteTime);
                gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.25);
                osc.connect(gain); gain.connect(dest);
                osc.start(noteTime); osc.stop(noteTime + 0.25);
            });
        }
        else if (type === 'build_click') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.03);
            gain.gain.setValueAtTime(0.04, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
            osc.connect(gain); gain.connect(dest);
            osc.start(now); osc.stop(now + 0.03);
        }
        else if (type === 'victory_fanfare') {
            const melody = [
                { f: 440, t: 0.0 }, { f: 523.25, t: 0.14 }, { f: 659.25, t: 0.28 },
                { f: 880, t: 0.42 }, { f: 659.25, t: 0.58 }, { f: 880, t: 0.68 },
                { f: 1046.5, t: 0.82 }, { f: 1318.5, t: 1.0 }, { f: 1046.5, t: 1.3 },
                { f: 880, t: 1.5 }, { f: 1046.5, t: 1.65 }, { f: 1318.5, t: 1.85 }
            ];
            melody.forEach(({ f, t }) => {
                const osc = audioCtx.createOscillator();
                const filter = audioCtx.createBiquadFilter();
                const gain = audioCtx.createGain();
                const nt = now + t;
                filter.type = 'lowpass'; filter.frequency.value = 2400;
                osc.type = 'square';
                osc.frequency.setValueAtTime(f, nt);
                gain.gain.setValueAtTime(0.0, nt);
                gain.gain.linearRampToValueAtTime(0.14, nt + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.01, nt + 0.22);
                osc.connect(filter); filter.connect(gain); gain.connect(dest);
                osc.start(nt); osc.stop(nt + 0.26);
            });
        }
    } catch (e) {
        console.warn("Audio error:", e);
    }
}

export function resumeAudioContext() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

export const soundtrack = new Audio('https://nu.vgmtreasurechest.com/soundtracks/c64-remix-2018/deigeeid/01.%20Lightforce.mp3');
soundtrack.loop = true;
soundtrack.volume = 0.1;

export function toggleSoundtrack() {
    if (audioState.isSoundtrackPlaying) {
        soundtrack.pause();
        audioState.isSoundtrackPlaying = false;
    } else {
        soundtrack.play().catch(e => console.warn("Soundtrack play failed:", e));
        audioState.isSoundtrackPlaying = true;
    }
}

export function setSoundtrackVolume(vol) {
    audioState.soundtrackVolume = vol;
    soundtrack.volume = vol;
}
