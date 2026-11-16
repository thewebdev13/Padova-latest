/** Capacity/network failures must never be presented as invalid financial input. */
export function databaseUnavailable(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  return (
    [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'EPIPE',
      '53300',
      '57P01',
      '57P02',
      '57P03',
      '08000',
      '08003',
      '08006',
    ].includes(e?.code ?? '') ||
    /EMAXCONNSESSION|max clients reached|too many clients|connection terminated|connection timeout|timeout exceeded when trying to connect/i.test(
      e?.message ?? '',
    )
  );
}
export const temporarilyUnavailable = 'Padova is temporarily unavailable. Please retry shortly.';
