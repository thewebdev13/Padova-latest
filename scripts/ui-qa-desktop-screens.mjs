import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';

const base = 'http://127.0.0.1:3000';
const out = path.resolve('.data/ui-qa');
mkdirSync(out, { recursive: true });
const creds = JSON.parse(readFileSync('.data/ui-qa/local-owner.json', 'utf8'));

// Labels as shown in the sidebar (Bookings → Transactions, People & Families → People)
const pages = [
  'Dashboard',
  'Transactions',
  'People',
  'Companies',
  'Suppliers',
  'Sources & Brokers',
  'Partnerships',
  'Payments',
  'Travel Assets',
  'Commissions',
  'Refunds',
  'Calendar',
  'Follow-up',
  'Attention',
  'Tasks',
  'Accounting',
  'Users & Permissions',
  'Activity',
  'Settings',
];

const findings = [];

function measure(page) {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const content = document.querySelector('.content');
    const sidebar = document.querySelector('.sidebar');
    const overlaps = [];
    const cards = [...document.querySelectorAll('.card, .metric, .person-card, .modal')];
    for (const el of cards.slice(0, 40)) {
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 20) continue;
      // flag elements that overflow viewport horizontally
      if (r.right > window.innerWidth + 1) overlaps.push({ cls: el.className, right: r.right });
    }
    return {
      title: document.title,
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 220),
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
      contentPad: content ? getComputedStyle(content).padding : null,
      sidebarW: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : null,
      space5: cs.getPropertyValue('--space-5').trim(),
      contentPadX: cs.getPropertyValue('--content-pad-x').trim(),
      overlaps: overlaps.slice(0, 5),
      hasShell: Boolean(sidebar && content),
    };
  });
}

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();
page.setDefaultTimeout(60000);

await page.goto(base + '/', { waitUntil: 'networkidle2' });
await page.waitForSelector('input[type="email"], input[name="email"], input[autocomplete="username"]');
await page.type('input[type="email"], input[name="email"], input[autocomplete="username"]', creds.email, {
  delay: 10,
});
await page.type('input[type="password"]', creds.password, { delay: 10 });
await Promise.all([
  page.click('button[type="submit"], button.primary, form button'),
  page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
]);
await page.waitForFunction(() => document.querySelector('.sidebar') || document.body.innerText.includes('Your business'), {
  timeout: 45000,
}).catch(() => {});
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: path.join(out, 'desktop-Dashboard.png') });
findings.push({ id: 'Dashboard', ...(await measure(page)) });

for (const name of pages.slice(1)) {
  const clicked = await page.evaluate((label) => {
    const items = [...document.querySelectorAll('.nav-item, button, a')];
    const el = items.find((n) => (n.textContent || '').trim() === label || (n.textContent || '').includes(label));
    if (!el) return false;
    el.click();
    return true;
  }, name);
  await new Promise((r) => setTimeout(r, 900));
  const id = name.replace(/[^a-zA-Z0-9]+/g, '-');
  await page.screenshot({ path: path.join(out, `desktop-${id}.png`) });
  const m = await measure(page);
  findings.push({ id: name, clicked, ...m });
  console.log(name, clicked ? 'ok' : 'MISS', m.overflowX ? 'OVERFLOW' : 'clean', m.sidebarW);
}

// Open New booking modal from Dashboard/Bookings
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => /New booking/i.test(b.textContent || ''));
  btn?.click();
});
await new Promise((r) => setTimeout(r, 800));
const modalOpen = await page.evaluate(() => Boolean(document.querySelector('.modal.booking-entry, .modal')));
await page.screenshot({ path: path.join(out, 'desktop-Booking-modal.png') });
findings.push({ id: 'Booking modal', modalOpen, ...(await measure(page)) });

writeFileSync(path.join(out, 'desktop-findings.json'), JSON.stringify(findings, null, 2));
console.log('DONE', findings.length, 'screens');
await browser.close();
