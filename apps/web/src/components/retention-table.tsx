import type { RetentionResult } from '@eventlens/contracts';

export function RetentionTable({ report }: { report: RetentionResult }) {
  return (
    <div className="mt-5 overflow-x-auto">
      <table
        className="w-full border-collapse text-left text-sm"
        aria-label="Daily cohort retention"
      >
        <caption className="mb-3 text-left text-stone-500">
          Exact-day returns in {report.timezone}. Each cell shows people and
          percentage of the original cohort.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="p-3">
              Entry date
            </th>
            <th scope="col" className="p-3">
              Cohort size
            </th>
            {Array.from({ length: report.days + 1 }, (_, day) => (
              <th scope="col" key={day} className="whitespace-nowrap p-3">
                Day {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.cohorts.map((cohort) => (
            <tr key={cohort.date} className="border-t">
              <th scope="row" className="whitespace-nowrap p-3 font-medium">
                {cohort.date}
              </th>
              <td className="p-3">{cohort.size.toLocaleString()}</td>
              {cohort.cells.map((cell) => (
                <td
                  key={cell.day}
                  className="min-w-28 border-l p-3"
                  style={
                    cell.rate === null
                      ? undefined
                      : {
                          backgroundColor: `rgba(16, 185, 129, ${0.04 + cell.rate * 0.3})`,
                        }
                  }
                >
                  {cell.users === null || cell.rate === null ? (
                    <span className="text-stone-500">Unavailable</span>
                  ) : (
                    <>
                      <strong className="block">
                        {(cell.rate * 100).toFixed(1)}%
                      </strong>
                      <span>{cell.users.toLocaleString()} people</span>
                    </>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
