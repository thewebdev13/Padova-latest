import type { SQL } from './db';

// Business dates follow the preserved company timezone, not the server's UTC day.
export async function businessDate(db: SQL, instant = new Date()) {
  const timezone =
    db.storage === 'padova'
      ? ((await db.query('SELECT business_timezone FROM padova.settings WHERE id=true')).rows[0]
          ?.business_timezone ?? 'America/New_York')
      : 'Asia/Jerusalem';
  return instant.toLocaleDateString('en-CA', {
    timeZone: timezone,
    calendar: 'gregory',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
