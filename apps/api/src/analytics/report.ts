import { HttpException, RequestTimeoutException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@eventlens/database';

let activeReports = 0;
const REPORT_CONCURRENCY = 4;
function expired(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 5) return false;
  const detail = error as Record<string, unknown>;
  if (
    [detail.code, detail.originalCode].some((code) =>
      ['P2028', 'P2024', '57014', '55P03'].includes(String(code)),
    )
  )
    return true;
  return ['cause', 'meta', 'driverAdapterError'].some((key) =>
    expired(detail[key], depth + 1),
  );
}
export async function withReport<T>(
  db: PrismaClient,
  action: (tx: Prisma.TransactionClient, checkBudget: () => void) => Promise<T>,
): Promise<T> {
  if (activeReports >= REPORT_CONCURRENCY)
    throw new HttpException('Analytics is busy. Try again shortly.', 429);
  activeReports++;
  const deadline = Date.now() + 10000;
  const checkBudget = () => {
    if (Date.now() >= deadline)
      throw new RequestTimeoutException(
        'Narrow the report range and try again.',
      );
  };
  try {
    return await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL statement_timeout = '10s'`;
        await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
        checkBudget();
        const result = await action(tx, checkBudget);
        checkBudget();
        return result;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 12000,
        maxWait: 1000,
      },
    );
  } catch (error) {
    if (expired(error))
      throw new RequestTimeoutException(
        'Narrow the report range and try again.',
      );
    throw error;
  } finally {
    activeReports--;
  }
}
