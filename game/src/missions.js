// The story: Kai Mercer comes home to Velmara broke, and Lena Cruz has work
// for a driver who asks no questions. Six missions, each with phases, dialogue
// and a cash reward; the last one ends the story.

import { money } from './random.js';

function mission(id, title, reward, briefing, completeLine, phases) {
  return { id, title, reward, briefing, completeLine, phases };
}

export const MISSION_LIST = [
  mission('homecoming', 'Homecoming', 200,
    ['LENA: Kai! You actually came back to Velmara.',
     'LENA: Meet me at the plaza fountain. I have work for a driver like you.'],
    'LENA: Good. First rule of Velmara: never walk when you can drive.',
    [{ type: 'goto', place: 'plaza', text: 'Meet Lena at the plaza fountain' }]),
  mission('wheels', 'Borrowed Wheels', 300,
    ['LENA: You need wheels. Any car on the street will do —',
     'LENA: — just do not let the owner catch you. Bring it to Rico\'s garage.'],
    'RICO: She runs rough, but she is yours now. Nice work, kid.',
    [
      { type: 'getCar', text: 'Steal a car (walk up to one and press E)' },
      { type: 'goto', place: 'garage', text: 'Drive the car to Rico\'s garage', needCar: true },
    ]),
  mission('drop', 'The Drop', 500,
    ['LENA: A package is waiting at the docks. Pick it up,',
     'LENA: take it to the Sunset Motel. No questions, no stops.'],
    'LENA: Delivered clean. The client is happy — and so am I.',
    [
      { type: 'pickup', place: 'docks', text: 'Pick up the package at the docks' },
      { type: 'goto', place: 'motel', text: 'Deliver the package to the Sunset Motel', wantedOnEnter: 2 },
    ]),
  mission('alley', 'Alley Ambush', 600,
    ['RICO: The Vipers jumped one of our couriers by the market.',
     'RICO: Go teach them Velmara manners. All of them.'],
    'RICO: The market is ours again. Here is your cut.',
    [
      { type: 'combat', place: 'market', count: 4, text: 'Deal with the Vipers at the market' },
    ]),
  mission('heat', 'Heat Wave', 800,
    ['LENA: The whole precinct is looking for you after that alley.',
     'LENA: Stay out of their hands for a full minute. Do not get caught.'],
    'LENA: You lost them. In this city, that makes you a legend.',
    [
      { type: 'survive', seconds: 60, wanted: 3, text: 'Survive the police chase — 60 seconds' },
    ]),
  mission('score', 'The Big Score', 2500,
    ['LENA: One last job, Kai. Velmara Trust, high noon.',
     'LENA: Grab the cash, lose the cops, meet me at the hideout. We leave rich.'],
    'LENA: We did it, Kai. Velmara is ours now. — STORY COMPLETE —',
    [
      { type: 'pickup', place: 'bank', text: 'Hit the Velmara Trust bank' },
      { type: 'goto', place: 'hideout', text: 'Escape to the hideout', wantedOnEnter: 4 },
    ]),
];

export class Missions {
  constructor(places, hooks) {
    this.places = places;
    this.hooks = hooks; // { say(lines), spawnGang(n,x,z), addWanted(n), onReward(amount), onComplete(m), onStart(m) }
    this.index = 0;
    this.phase = 0;
    this.timer = 0;
    this.killsNeeded = 0;
    this.killsDone = 0;
    this.phaseStarted = false;
    this.storyDone = false;
    this.active = false;
  }

  current() {
    return this.index < MISSION_LIST.length ? MISSION_LIST[this.index] : null;
  }

  currentPhase() {
    const m = this.current();
    return m ? m.phases[this.phase] : null;
  }

  start(index) {
    this.index = index;
    this.phase = 0;
    this.storyDone = false;
    this.active = true;
    const m = this.current();
    if (m) {
      this.hooks.say(m.briefing);
      this.hooks.onStart?.(m);
    }
  }

  startNext() {
    this.start(this.index + 1);
  }

  markerPos() {
    const ph = this.currentPhase();
    if (!ph || !this.active) return null;
    if (ph.place) {
      const p = this.places[ph.place];
      return p ? { x: p.x, z: p.z } : null;
    }
    return null;
  }

  objectiveText() {
    if (this.storyDone) return 'Story complete — free roam Velmara!';
    const m = this.current();
    if (!m || !this.active) return 'Press Enter to start the story';
    const ph = this.currentPhase();
    if (!ph) return m.title;
    if (ph.type === 'survive') return `${ph.text} — ${Math.ceil(this.timer)}s left`;
    if (ph.type === 'combat') return `${ph.text} — ${this.killsDone}/${this.killsNeeded} down`;
    return ph.text;
  }

  onKill() {
    this.killsDone += 1;
  }

  /** Called every frame with the player's state. Returns completed mission or null. */
  update(dt, ctx) {
    if (!this.active || this.storyDone) return null;
    const m = this.current();
    if (!m) return null;
    const ph = this.currentPhase();
    if (!ph) return this.finish(m);

    if (!this.phaseStarted) {
      this.phaseStarted = true;
      if (ph.type === 'combat') {
        const p = this.places[ph.place];
        this.killsNeeded = ph.count;
        this.killsDone = 0;
        this.hooks.spawnGang(ph.count, p.x, p.z);
      }
      if (ph.type === 'survive') {
        this.timer = ph.seconds;
        this.hooks.addWanted(ph.wanted);
      }
    }

    let done = false;
    if (ph.type === 'goto' || ph.type === 'pickup') {
      const p = this.places[ph.place];
      if (Math.hypot(ctx.x - p.x, ctx.z - p.z) < 10) {
        if (ph.type === 'pickup') this.hooks.onPickup?.(ph.place);
        done = true;
      }
      if (ph.needCar && !ctx.inCar) {
        // Player left the car: keep the objective but wait.
      }
    } else if (ph.type === 'getCar') {
      if (ctx.inCar) done = true;
    } else if (ph.type === 'combat') {
      if (this.killsDone >= this.killsNeeded) done = true;
    } else if (ph.type === 'survive') {
      if (ctx.wanted > 0) this.timer -= dt;
      else this.hooks.addWanted(2); // the heat finds you again
      if (this.timer <= 0) done = true;
    }

    if (!done) return null;
    if (ph.wantedOnEnter) this.hooks.addWanted(ph.wantedOnEnter);
    this.phase += 1;
    this.phaseStarted = false;
    if (this.phase >= m.phases.length) return this.finish(m);
    const next = this.currentPhase();
    if (next) this.hooks.say(['NEW OBJECTIVE: ' + next.text]);
    return null;
  }

  finish(m) {
    this.hooks.onReward?.(m.reward);
    this.hooks.say([m.completeLine, `Reward: ${money(m.reward)}`]);
    this.hooks.onComplete?.(m);
    this.index += 1;
    this.phase = 0;
    this.phaseStarted = false;
    if (this.index >= MISSION_LIST.length) {
      this.storyDone = true;
      this.active = false;
      return m;
    }
    const next = this.current();
    this.hooks.say(next.briefing);
    this.hooks.onStart?.(next);
    this.active = true;
    return m;
  }
}
