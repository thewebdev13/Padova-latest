#!/usr/bin/env node
/**
 * Read-only extract from Owner PM 2026 CSV → directory pick-list JSON.
 * No money, no bookings, no receipts. Output under .data/directory-seed/ (gitignored).
 */
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEFAULT_CSV = path.resolve(
  ROOT,
  '../bakups-16-11-26/PM Accounting 2026 - Capital One and Travel Credits/PM accounting 2026 - 2026 accounting (1).csv',
);
const OUT_DIR = path.join(ROOT, '.data', 'directory-seed');
const OUT = path.join(OUT_DIR, 'pm-2026-directory.json');

const AIRLINES = [
  'EL AL Israel Airlines',
  'United Airlines',
  'Delta Air Lines',
  'American Airlines',
  'JetBlue',
  'British Airways',
  'Lufthansa',
  'Air Canada',
  'Emirates',
  'Qatar Airways',
  'Turkish Airlines',
  'Swiss',
  'Iberia',
  'Aer Lingus',
  'Alaska Airlines',
  'Southwest Airlines',
  'Air France',
  'KLM',
  'LOT Polish Airlines',
  'Aegean Airlines',
  'Ryanair',
  'Wizz Air',
  'Norwegian',
  'SAS',
  'Finnair',
  'Icelandair',
  'Ethiopian Airlines',
  'EgyptAir',
  'Royal Jordanian',
  'Spirit Airlines',
  'Frontier Airlines',
  'Hawaiian Airlines',
  'Austrian Airlines',
];

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
      continue;
    }
    if (c === ',' && !q) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function normKey(s) {
  return s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function displayName(s) {
  return s
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w+/g, (w) => {
      if (/^[A-Z0-9]{2,}$/.test(w) && w.length <= 6) return w;
      return w.charAt(0).toLocaleUpperCase() + w.slice(1).toLocaleLowerCase();
    });
}

function splitPassengers(raw) {
  return raw
    .split(/[,;/|&+]|\band\b/i)
    .map((p) => p.replace(/\s+/g, ' ').trim().replace(/^[-–]+|[-–]+$/g, ''))
    .filter((p) => p.length >= 3 && !/^\d+$/.test(p));
}

function stripAccountLabel(raw) {
  return raw
    .replace(/\b(amex|card ending)\b/gi, '')
    .replace(/\b\d{3,4}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function websiteHost(raw) {
  let s = raw.trim().toLowerCase();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    return new URL(s).hostname.replace(/^www\./, '');
  } catch {
    return raw
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0];
  }
}

const csvPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_CSV;
const clients = new Map();
const passengers = new Map();
const firstPassengers = new Map();
const accounts = new Map();
const websites = new Map();
let rows = 0;
let header = null;

const rl = createInterface({ input: createReadStream(csvPath, { encoding: 'utf8' }) });
for await (const line of rl) {
  if (!line.trim()) continue;
  const cols = parseCsvLine(line.replace(/^\uFEFF/, ''));
  if (!header) {
    header = cols;
    continue;
  }
  rows += 1;
  const row = Object.fromEntries(header.map((h, i) => [h, cols[i] ?? '']));
  const client = (row.client || '').trim();
  if (client && !/^(vouch)$/i.test(client)) {
    const k = normKey(client);
    if (!clients.has(k)) clients.set(k, displayName(client));
  }
  const parts = splitPassengers(row['Name of Passengers'] || '');
  parts.forEach((p, i) => {
    const k = normKey(p);
    if (!passengers.has(k)) passengers.set(k, displayName(p));
    if (i === 0 && !firstPassengers.has(k)) firstPassengers.set(k, displayName(p));
  });
  const acct = stripAccountLabel(row['Account Under'] || '');
  if (acct.length >= 3) {
    const k = normKey(acct);
    if (!accounts.has(k)) accounts.set(k, displayName(acct));
  }
  const host = websiteHost(row.Website || '');
  if (host && host.includes('.')) websites.set(host, (websites.get(host) || 0) + 1);
}

const airlineFromSites = [...websites.keys()].some((h) => h.includes('elal'))
  ? ['EL AL Israel Airlines']
  : [];

const payload = {
  source: {
    file: csvPath,
    extracted_on: new Date().toISOString(),
    row_count: rows,
    purpose: 'directory_seed_only',
    money: false,
  },
  airlines: [...new Set([...AIRLINES, ...airlineFromSites])].sort(),
  customers: [...firstPassengers.values()].sort((a, b) => a.localeCompare(b)),
  travelers: [...passengers.values()].sort((a, b) => a.localeCompare(b)),
  account_holders: [...accounts.values()].sort((a, b) => a.localeCompare(b)),
  booking_websites: [...websites.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([host, count]) => ({ host, count })),
  referral_org_candidates: [...clients.values()]
    .filter((n) => !/^(joe|meir sommer|rabbi sommer)$/i.test(n))
    .sort((a, b) => a.localeCompare(b)),
};

await mkdir(OUT_DIR, { recursive: true });
await writeFile(OUT, JSON.stringify(payload, null, 2));
console.log(
  JSON.stringify(
    {
      out: OUT,
      rows,
      airlines: payload.airlines.length,
      customers: payload.customers.length,
      travelers: payload.travelers.length,
      account_holders: payload.account_holders.length,
      booking_websites: payload.booking_websites.length,
      referral_org_candidates: payload.referral_org_candidates.length,
    },
    null,
    2,
  ),
);
