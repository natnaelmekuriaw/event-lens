import assert from 'node:assert/strict';
import { URLSearchParams } from 'node:url';
import { createApp } from '../apps/api/dist/server.js';
import { createDatabase } from '../packages/database/dist/index.js';
import {
  processReceipt,
  eventQueue,
  dispatchOutbox,
} from '../packages/pipeline/dist/index.js';
import { recoverAccount } from '../apps/api/dist/auth/recovery.js';

if (
  process.env.TEST_DATABASE_ISOLATED !== '1' ||
  !/^\/eventlens_verify_[0-9]+_[a-f0-9]{12}_restore$/.test(
    new URL(process.env.DATABASE_URL).pathname,
  )
)
  throw new Error('Restore acceptance requires an isolated restore database');
const db = createDatabase(process.env.DATABASE_URL);
const app = await createApp();
const queue = eventQueue(process.env.REDIS_URL);
queue.on('error', () => {});
try {
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const request = (path, method = 'GET', body, cookie) =>
    fetch(`${base}/api${path}`, {
      method,
      headers: {
        Origin: process.env.APP_URL,
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  async function signIn(password) {
    return request('/auth/sign-in/email', 'POST', {
      email: process.env.TEST_OWNER_EMAIL,
      password,
    });
  }
  const signedIn = await signIn(process.env.TEST_OWNER_PASSWORD);
  assert.equal(signedIn.status, 200);
  const oldCookie = signedIn.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  await db.$transaction(async (tx) => {
    await tx.session.deleteMany();
    await tx.invitation.deleteMany();
    await tx.verification.deleteMany();
  });
  assert.equal(
    (await request('/v1/workspaces', 'GET', undefined, oldCookie)).status,
    401,
  );
  const nextPassword = process.env.TEST_OWNER_PASSWORD + '-recovered';
  await recoverAccount(db, process.env.TEST_OWNER_EMAIL, nextPassword);
  assert.equal((await signIn(process.env.TEST_OWNER_PASSWORD)).status, 401);
  const recovered = await signIn(nextPassword);
  assert.equal(recovered.status, 200);
  const cookie = recovered.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  const basePath = `/v1/workspaces/${process.env.RELEASE_WORKSPACE_ID}/projects/${process.env.RELEASE_PROJECT_ID}`;
  assert.equal((await request(basePath, 'GET', undefined, cookie)).status, 200);
  const event = JSON.parse(process.env.RELEASE_EVENT);
  const input = {
    projectKey: process.env.RELEASE_PROJECT_KEY,
    events: [event],
  };
  const duplicate = await request('/v1/ingest', 'POST', input);
  assert.equal(duplicate.status, 202);
  assert.equal((await duplicate.json()).duplicates, 1);
  await dispatchOutbox(db, queue);
  // Redis is a disposable dedicated instance; erase actual queue state before reconstructing it.
  await (await queue.client).flushdb();
  await db.eventOutbox.updateMany({ data: { nextDispatchAt: new Date(0) } });
  await dispatchOutbox(db, queue);
  await processReceipt(db, {
    receiptId: process.env.RELEASE_RECEIPT_ID,
    generation: 0,
  });
  await processReceipt(db, {
    receiptId: process.env.RELEASE_RECEIPT_ID,
    generation: 0,
  });
  assert.equal(
    await db.analyticsEvent.count({
      where: {
        projectId: process.env.RELEASE_PROJECT_ID,
        eventId: event.eventId,
      },
    }),
    1,
  );
  const from = new Date(Date.now() - 86400000).toISOString();
  const to = new Date(Date.now() + 86400000).toISOString();
  for (const suffix of [
    `/analytics/overview?${new URLSearchParams({ from, to })}`,
    `/retention?${new URLSearchParams({ from: from.slice(0, 10), to: to.slice(0, 10), entryEvent: event.name, returnEvent: event.name })}`,
  ])
    assert.equal(
      (await request(basePath + suffix, 'GET', undefined, cookie)).status,
      200,
    );
  const path = await request(
    basePath + '/conversion-paths',
    'POST',
    {
      name: 'Restored conversion',
      steps: [{ name: event.name }, { name: event.name }],
      windowMinutes: 60,
    },
    cookie,
  );
  assert.equal(path.status, 201);
  const id = (await path.json()).id;
  assert.equal(
    (
      await request(
        `${basePath}/conversion-paths/${id}/results?${new URLSearchParams({ from, to })}`,
        'GET',
        undefined,
        cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        `/v1/workspaces/00000000-0000-4000-8000-000000000001/projects/${process.env.RELEASE_PROJECT_ID}`,
        'GET',
        undefined,
        cookie,
      )
    ).status,
    404,
  );
  assert.equal(await db.invitation.count(), 0);
  console.log(
    'Restored sign-in, recovery, read isolation, analytics, and duplicate protection passed.',
  );
} finally {
  await queue.close();
  await app.close();
  await db.$disconnect();
}
