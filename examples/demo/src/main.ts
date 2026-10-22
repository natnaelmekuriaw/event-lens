import {
  createEventLens,
  type EventLens,
  type Properties,
} from '@eventlens/sdk';
import './style.css';
const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
let analytics: EventLens | undefined;
let level = 1;
let score = 0;
let playing = false;
let startedAt = Date.now();
const buttons = ['start', 'complete', 'over', 'identify', 'reset'];
function state() {
  element('game-state').textContent = playing
    ? 'Clear the next constellation'
    : 'Ready to play';
  element('score').textContent = `Level ${level} · Score ${score}`;
  element<HTMLButtonElement>('start').disabled = !analytics || playing;
  element<HTMLButtonElement>('complete').disabled = !analytics || !playing;
  element<HTMLButtonElement>('over').disabled = !analytics || !playing;
}
async function track(name: string, properties: Properties = {}) {
  if (!analytics) return;
  const accepted = analytics.track(name, {
    ...properties,
    platform: 'demo-browser',
  });
  const row = document.createElement('li');
  row.textContent = accepted
    ? name
    : name + ' · tracking disabled or buffer full';
  element('activity').prepend(row);
  while (element('activity').children.length > 10)
    element('activity').lastElementChild?.remove();
  try {
    await analytics.flush();
    element('delivery').textContent = accepted
      ? 'Batch accepted. Check the EventLens explorer.'
      : 'No event sent.';
  } catch {
    element('delivery').textContent =
      'Delivery failed. Check the API endpoint and project key.';
  }
}
element('connect').addEventListener('submit', (event) => {
  event.preventDefault();
  analytics?.destroy();
  try {
    analytics = createEventLens({
      endpoint: element<HTMLInputElement>('endpoint').value,
      projectKey: element<HTMLInputElement>('project-key').value,
      flushIntervalMs: 2000,
      optOut: element<HTMLInputElement>('optout').checked,
    });
    element('connection').textContent = 'Analytics client ready.';
    buttons.forEach((id) => {
      element<HTMLButtonElement>(id).disabled = false;
    });
    state();
  } catch (error) {
    analytics = undefined;
    element('connection').textContent =
      error instanceof Error ? error.message : 'Unable to connect';
    state();
  }
});
element('start').addEventListener('click', () => {
  playing = true;
  level = 1;
  score = 0;
  startedAt = Date.now();
  state();
  void track('game_started');
  void track('level_started', { level });
});
element('complete').addEventListener('click', async () => {
  const duration = Date.now() - startedAt;
  score += level * 100;
  await track('level_completed', { level, score, duration_ms: duration });
  level++;
  startedAt = Date.now();
  state();
  await track('level_started', { level });
});
element('over').addEventListener('click', () => {
  playing = false;
  state();
  void track('game_over', {
    level,
    score,
    duration_ms: Date.now() - startedAt,
  });
});
element('identify').addEventListener('click', async () => {
  if (analytics?.identify(element<HTMLInputElement>('user-id').value)) {
    await track('player_identified');
  }
});
element('reset').addEventListener('click', () => {
  analytics?.reset();
  element('delivery').textContent = 'New anonymous player context created.';
});
element('optout').addEventListener('change', () => {
  const optedOut = element<HTMLInputElement>('optout').checked;
  analytics?.setOptOut(optedOut);
  element('delivery').textContent = optedOut
    ? 'Tracking is disabled and queued events were cleared.'
    : 'Tracking enabled with a fresh anonymous ID.';
});
window.addEventListener('pagehide', () => {
  /* The SDK performs its own best-effort shutdown flush. */
});
