/**
 * Bruitages synthétisés à la volée (WebAudio) : aucun fichier son à charger.
 * Le contexte n'est créé qu'au premier geste utilisateur, comme l'exigent les
 * navigateurs.
 */
import { state, commit } from './state.js';

let ctx = null;

/**
 * Les navigateurs refusent de démarrer un AudioContext tant que l'utilisateur
 * n'a pas interagi avec la page, et se plaignent en console à chaque tentative.
 * Or des sons peuvent survenir sans geste — un booster crédité au chargement,
 * par exemple. On attend donc la première interaction réelle avant de créer
 * quoi que ce soit : les sons d'avant sont simplement passés sous silence.
 */
let gestured = false;
for (const evt of ['pointerdown', 'keydown']) {
  window.addEventListener(
    evt,
    () => {
      gestured = true;
    },
    { once: true }
  );
}

function ac() {
  if (!state.sound || !gestured) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ freq, dur = 0.18, type = 'sine', gain = 0.13, delay = 0, slideTo = null }) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.35, gain = 0.16, filter = 1400 }) {
  const c = ac();
  if (!c) return;
  const frames = Math.floor(c.sampleRate * dur);
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // décroissance exponentielle : donne l'attaque sèche d'un déchirement
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = filter;
  const amp = c.createGain();
  amp.gain.value = gain;
  src.connect(band).connect(amp).connect(c.destination);
  src.start();
}

export const sfx = {
  tear() {
    noise({ dur: 0.45, gain: 0.2, filter: 1800 });
    tone({ freq: 180, slideTo: 60, dur: 0.4, type: 'triangle', gain: 0.1 });
  },
  flip() {
    tone({ freq: 620, slideTo: 900, dur: 0.07, type: 'square', gain: 0.05 });
  },
  reveal(rarity) {
    if (rarity === 'epic') {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone({ freq: f, dur: 0.5, type: 'triangle', gain: 0.11, delay: i * 0.075 })
      );
      noise({ dur: 0.8, gain: 0.07, filter: 5200 });
    } else if (rarity === 'rare') {
      [493.88, 739.99].forEach((f, i) =>
        tone({ freq: f, dur: 0.3, type: 'triangle', gain: 0.09, delay: i * 0.07 })
      );
    } else {
      tone({ freq: 330, dur: 0.14, type: 'sine', gain: 0.06 });
    }
  },
  booster() {
    [659.25, 987.77].forEach((f, i) =>
      tone({ freq: f, dur: 0.35, type: 'sine', gain: 0.08, delay: i * 0.1 })
    );
  },
};

export function toggleSound() {
  state.sound = !state.sound;
  commit('sound');
  if (state.sound) sfx.flip();
  return state.sound;
}
