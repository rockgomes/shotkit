// web/inspector-canvas.js — the controls that belong to the CANVAS rather
// than to anything in it. Today that is Grain.
//
// GRAIN PAINTS ON THE GROUND, AND ONLY ON THE GROUND. Cycle A Task 4b moved
// it under the shots for exactly that reason: it used to be an unclipped
// soft-light pass over the finished picture, so it landed on the user's own
// screenshot as well as the backdrop. It has nothing to do with whichever
// element you clicked, and it was sitting in a panel headed "Finish ·
// Desktop", which named one.
//
// PADDING IS NOT HERE, and that is Rock's call, 2026-09-06: "let's move only
// grain. Padding to me still makes sense on the right, since visually it
// moves the elements." He is describing what it looks like, and he is right
// that it looks like that. It stays in web/inspector-frame.js.
import { DEFAULTS } from '../core/index.js';
import { state, scheduleRender } from './state.js';

// Grain is a 0-1 fraction in core/config.js and a whole percent in the UI —
// the same *100 / *0.01 round trip padding and the shadow use. Moved here
// from web/inspector-frame.js with the control they drive.
export function activeGrainPercent(config) {
  const grain = Number.isFinite(config.grain) ? config.grain : DEFAULTS.grain;
  return Math.round(grain * 100);
}

export function setGrainPercent(config, pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return;
  config.grain = Math.min(100, Math.max(0, n)) / 100;
}

/**
 * Build the Canvas panel. Mounted on `#canvasSection`, which lives in the
 * LEFT panel beside Size and Background — the three things that describe the
 * shot as a whole.
 *
 * Returns its sync function so web/main.js can drive it the same way it
 * drives the other panels, or null when the section is absent.
 */
export function initCanvasPanel() {
  const section = document.getElementById('canvasSection');
  if (!section) return null;

  const grainRow = document.createElement('div');
  grainRow.className = 'slider-row';
  grainRow.innerHTML =
    '<div class="slider-label"><span>Grain</span><span class="mono slider-value"></span></div>';
  const grainInput = document.createElement('input');
  grainInput.type = 'range';
  grainInput.className = 'slider';
  grainInput.min = '0';
  grainInput.max = '100';
  grainInput.step = '1';
  grainInput.setAttribute('aria-label', 'Grain strength');
  grainRow.appendChild(grainInput);
  const grainValueEl = grainRow.querySelector('.slider-value');
  section.appendChild(grainRow);

  function syncGrainUI() {
    const pct = activeGrainPercent(state.config);
    grainInput.value = String(pct);
    const fill = ((pct - 0) / (100 - 0)) * 100;
    grainInput.style.setProperty('--slider-fill', `${fill}%`);
    grainValueEl.textContent = `${pct}%`;
  }

  grainInput.addEventListener('input', () => {
    setGrainPercent(state.config, grainInput.value);
    syncGrainUI();
    scheduleRender();
  });

  syncGrainUI();

  return { syncGrainUI };
}
