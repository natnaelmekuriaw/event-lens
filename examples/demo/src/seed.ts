import { createEventLens } from '@eventlens/sdk';
if (!process.env.DEMO_PROJECT_KEY)
  throw new Error('Set DEMO_PROJECT_KEY to a dedicated public project key');
const key = process.env.DEMO_PROJECT_KEY;
const runId = crypto.randomUUID().slice(0, 8);
let sent = 0;
for (let player = 1; player <= 20; player++) {
  const analytics = createEventLens({
    endpoint: process.env.API_URL ?? 'http://localhost:3001',
    projectKey: key,
    runtime: 'node',
    context: { anonymousId: `demo-${runId}-${player}` },
    flushIntervalMs: 0,
  });
  try {
    analytics.identify(`demo-player-${runId}-${player}`);
    analytics.track('game_started', { synthetic: true, platform: 'seed' });
    for (let level = 1; level <= (player % 4) + 1; level++) {
      analytics.track('level_started', {
        level,
        synthetic: true,
        platform: 'seed',
      });
      analytics.track('level_completed', {
        level,
        score: level * 100,
        duration_ms: 5000 + player * 100,
        synthetic: true,
        platform: 'seed',
      });
    }
    analytics.track('game_over', {
      level: (player % 4) + 1,
      score: ((player % 4) + 1) * 100,
      synthetic: true,
      platform: 'seed',
    });
    sent += analytics.pendingCount;
    await analytics.flush();
  } finally {
    analytics.destroy();
  }
}
console.log(
  `Durably sent ${sent} synthetic events. Wait for the worker, then refresh the event explorer.`,
);
