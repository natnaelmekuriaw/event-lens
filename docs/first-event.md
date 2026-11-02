# Send your first event

1. Sign in and open a workspace. Owners and admins can create a project. Choose
   its reporting timezone, then save the full public project key when shown.
   Only its prefix remains visible afterward. If the key is lost, rotate it in
   project settings and update every client using the old key.
2. Use the [browser or Node SDK](sdk.md) with your EventLens base URL and that
   public key. Track a named event and flush the client. Do not put a private
   account token in the SDK configuration.
3. Open **Events** for the project and refresh or enable live updates. A `202`
   ingestion response means the receipt and outbox work are durable in
   PostgreSQL. The worker must process the receipt before the event appears.
4. Check **Delivery status** on the Events page. A growing pending count points
   to worker or Redis availability; owners and admins can inspect retained
   failures and replay eligible receipts. See [event operations](events.md).

For a local sample, run `pnpm demo` in a second terminal after the application
is running. Open GalaxyBalls on port 3003, enter the local API base URL
`http://localhost:3001` and your public project key, then start and complete a
game. The demo sends synthetic `game_started` and `level_completed` events.
Inspect them in **Events**, then open **Analytics** or create a conversion path.

If the explorer is empty, check its name, actor, and UTC time filters. Verify
that the demo or SDK uses the intended project key and base URL, then inspect
pending and failed delivery counts. A public key permits ingestion only; sign in
as a workspace member to read reports.
