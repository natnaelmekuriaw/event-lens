# Downloading report data

Project members can download CSV from the dashboard after signing in. Exports use
the same member-only API responses as the visible reports. A public ingestion key
cannot read or export data. The files are created in the browser; EventLens does
not store an export job or email a file.

| Dashboard view   | Download              | Scope                                                  |
| ---------------- | --------------------- | ------------------------------------------------------ |
| Analytics        | Trends and top events | Applied date range, bucket, event and property filters |
| Conversion paths | Step results          | Selected path and applied UTC dates                    |
| Retention        | Daily cohorts         | Applied cohort, event and property filters             |
| Events           | Event records         | Current filters, newest first, at most 1,000 records   |

The event export reads up to ten pages of 100 through the ordinary authenticated
event endpoint. If more records match, the dashboard says the file is truncated;
narrow the filters and export again. Events that are still pending or expired are
not included. Report and event data can change between requests, so separately
downloaded files are not a shared database snapshot.

CSV files include range and timezone context where applicable. Retention cells
that are not yet observable have empty people and rate fields; zero means an
observed day with no returns. Conversion rates are fractions between 0 and 1.
Text that could be interpreted as a spreadsheet formula is prefixed with an
apostrophe before CSV quoting. Downloaded files may contain user identifiers and
event properties, so handle them according to your own data policy.
