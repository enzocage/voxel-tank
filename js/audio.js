// Web Audio API and Synthesizer sound generation

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
export const audioState = {
    isSfxEnabled: true,
    isSoundtrackPlaying: false,
    soundtrackVolume: 0.1
};

export function playSound(type, extra = {}) {
    if (!audioState.isSfxEnabled) return;
    try {
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const now = audioCtx.currentTime;

        if (type === 'shoot') {
            const osc = audioCtx.createOscillator();
            const noise = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(80, now + 0.35);

            noise.type = 'triangle';
            noise.frequency.setValueAtTime(100, now);
            noise.frequency.exponentialRampToValueAtTime(10, now + 0.2);

            gain.gain.setValueAtTime(0.4, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

            osc.connect(gain);
            noise.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            noise.start(now);
            osc.stop(now + 0.4);
            noise.stop(now + 0.4);
        } 
        else if (type === 'charge') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            const pitch = 150 + (extra.power || 0) * 450;
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(pitch, now);
            
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.08);
        }
        else if (type === 'explosion') {
            const bufferSize = audioCtx.sampleRate * 0.8;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            
            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;
            
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(450, now);
            filter.frequency.exponentialRampToValueAtTime(12, now + 0.7);
            
            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(0.65, now);
            gain.gain.exponentialRampToValueAtTime(0.005, now + 0.8);
            
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);
            noise.start(now);
        } 
        else if (type === 'move') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(80, now);
            osc.frequency.linearRampToValueAtTime(120, now + 0.1);
            
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.1);
        }
        else if (type === 'click') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
            
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.08);
        }
    } catch (e) {
        console.warn("Audio-Fehler:", e);
    }
}

export function resumeAudioContext() {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
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
