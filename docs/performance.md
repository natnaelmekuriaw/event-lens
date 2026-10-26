# Performance qualification

Performance figures are produced by executing `pnpm verify` on the actual release
revision. Until that run passes and its reports are reviewed, the workloads below
are qualification targets, not published capacity claims or service guarantees.

The supported topology is one API and one worker on one Docker host. The report
includes client host hardware, Node version, source revision, dirty-tree state,
dataset distribution, concurrency, warmup, and sample counts. The release
rehearsal also records actual image IDs. Database/Redis share the same local host;
these results do not describe a distributed production deployment.

| Workload                       | Fixture and measurement                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ingestion smoke                | 1,000 events / 100 actors; 25-event batches, four clients; acknowledgement percentiles                                                                   |
| Query smoke                    | Overview, conversion paths, retention over 1,000 processed events; two warmups and 20 reads                                                              |
| Historical queries             | 100,000 events / 10,000 actors, 14 entry days and 23 occurrence days in a 28-day range; four warmups, 100 reads, concurrency four, p50/p95/p99           |
| Expiry catch-up                | 3,000 expired events; bounded cleanup passes until drained; elapsed time and pass count                                                                  |
| Production sustained ingestion | Candidate 10 events/second for 60 seconds, batches of 10; HTTPS acknowledgement times, observed pending count, and drain after the final acknowledgement |

The sustained trial must drain within 30 one-second polling intervals after
sending stops. This is an acceptance bound, not an individual event latency
percentile. The smoke query samples are too small to characterize tail behavior;
use the larger historical-query report for that workload. A one-minute run cannot
prove multi-day stability, disk growth, retention capacity, or behavior under
unrelated host load.

Default cleanup runs once per minute and removes at most 1,000 expired events per
pass. Back-to-back qualification passes measure a catch-up mechanism, not the
default scheduler's sustained deletion throughput. Receipt tombstones remain
indefinitely for duplicate protection; plan disk growth and backups accordingly.
Do not increase ingestion limits based solely on acknowledgement throughput.

Before publishing operating limits, review all reports for the same clean source
revision, compare acknowledgement throughput with completion/backlog behavior,
check the historical query distributions and timeout rates, and document hardware,
disk, competing load, and the tested retention horizon. Keep the release a
candidate if these checks fail. Follow-up tuning must preserve foreground latency,
durability, and bounded cleanup work.
