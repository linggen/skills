// The human-like player for 射鹿 · 等风 (games/deerhunt.js; tools/board-bots.mjs). A patient hand by
// default: it waits for the deer's head to go down and the wind to drop (风歇), draws, lays the
// sight on the heart (ahead of a walking deer), holds still for the breath and lets go inside it;
// a gust or a lifted head mid-breath and it eases off and waits again. `handOf({ patient: false })`
// is the impatient hand of the tests: it draws at once and lets go at full, whatever the wind.
import { BREATH_MS, FULL_MS, STILL_MS, STEP_MS, breathing, headUp, heartOf, powerOf, shotOf, stepDeer, struck, windAt } from '../deerhunt.js';

const lull = (s, ms = s.clock) => Math.abs(windAt(s.levels[s.li], s.seed, ms)) <= 0.12;
const present = (d) => ['graze', 'walk'].includes(d.mode);

/** The deer `ms` ahead — a person learns a walking deer's pace; the bot reads it off its steps. */
function ahead(s, ms) {
  let d = s.deer, c = s.clock;
  for (let k = 0; k < ms; k += STEP_MS) { c += STEP_MS; d = stepDeer(d, s.levels[s.li], s.seed, STEP_MS, c); }
  return d;
}

export function handOf({ patient = true, lead = 200 } = {}) {
  let aimedFor = null;
  return function bot(s, see = {}) {
    if (s.won || !s.live) return null;
    if (s.phase === 'clear') return { g: 'next' };
    if (s.phase !== 'wait') return null;
    const late = see.lead ?? lead;
    if (!s.draw) {
      aimedFor = null;
      if (!present(s.deer) && patient) return null;
      if (patient && headUp(s.deer)) return null;
      if (['bolt', 'away'].includes(s.deer.mode)) return null;
      if (patient && !lull(s, s.clock + late)) return null;
      return { hold: {} };
    }
    const p = powerOf(s), shot = shotOf(s);
    // Lay the sight once, where the heart will be when the breath is held and the arrow comes.
    if (aimedFor !== s.draw.at) {
      aimedFor = s.draw.at;
      const wait = patient ? Math.max(0, FULL_MS + STILL_MS - (s.clock - s.draw.at)) + 500 : Math.max(0, FULL_MS - (s.clock - s.draw.at));
      const [x, y] = heartOf(ahead(s, wait + late + shot.T));
      return { g: 'aim', x, y };
    }
    if (!patient) return p >= 1 ? { release: true } : null;
    const left = s.draw.breathAt == null ? BREATH_MS : s.draw.breathAt + BREATH_MS - s.clock;
    const d = ahead(s, late + shot.T);
    if (breathing(s) && lull(s, s.clock + late) && !headUp(s.deer) && struck(d, shotOf(s, s.clock + late).to) === 'clean') return { release: true };
    // A walking deer drifts off the sight: lay it again, ahead of it.
    if (breathing(s) && s.deer.mode === 'walk' && left > 900) {
      const [x, y] = heartOf(ahead(s, late + shot.T + 300));
      if (Math.hypot(x - s.aim[0], y - s.aim[1]) > 6) return { g: 'aim', x, y };
    }
    if (s.draw.breathAt != null && left < 350) return { g: 'ease' }; // the breath is going: ease off, wait again
    return null;
  };
}

export const bot = handOf();
