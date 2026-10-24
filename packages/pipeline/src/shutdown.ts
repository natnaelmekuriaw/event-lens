// A supervisor may terminate sooner; receipts/outbox remain the recovery source.
export function installShutdownDeadline(milliseconds = 25000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const begin = () => {
    if (timer) return;
    timer = setTimeout(() => {
      console.error(
        'Shutdown deadline exceeded; supervisor restart is required.',
      );
      process.exit(1);
    }, milliseconds);
    timer.unref();
  };
  process.once('SIGTERM', begin);
  process.once('SIGINT', begin);
}
