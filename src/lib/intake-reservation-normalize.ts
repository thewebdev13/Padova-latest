/**
 * Turn free-form reservation emails/PDFs into Field: Value lines for parseQuickPaste.
 * Supports Capital One Business Travel, GDS/agency itineraries, United, Amex Travel
 * flights, and Amex Travel hotel stays (Guest Name / Hotel Confirmation #).
 * Only maps evidence in the text — never invents customer, ownership, or paid status.
 * Never uses Padova agency card imprint (e.g. Shmuel Padawer) as Customer.
 */

/** Agency / Padova cardmember imprints — never billed Customer. */
function isAgencyImprintName(name: string): boolean {
  return /^(shmuel\s+padawer|padova(\s+travels?)?|padova\s+travel)$/i.test(name.trim());
}

/** Padova Field:Value paste near the top — leave those alone. */
const PADOVA_PASTE_HEAD =
  /^(customer|client|product|traveler|guest|pnr|confirmation|booking reference|airline|route|price|total)\s*:/im;

const MONTHS: Record<string, string> = {
  january: '01',
  jan: '01',
  february: '02',
  feb: '02',
  march: '03',
  mar: '03',
  april: '04',
  apr: '04',
  may: '05',
  june: '06',
  jun: '06',
  july: '07',
  jul: '07',
  august: '08',
  aug: '08',
  september: '09',
  sep: '09',
  sept: '09',
  october: '10',
  oct: '10',
  november: '11',
  nov: '11',
  december: '12',
  dec: '12',
};

const AIRPORT_SKIP = new Set([
  'USD',
  'ET',
  'PDF',
  'FAQ',
  'THE',
  'AND',
  'FOR',
  'YOU',
  'ARE',
  'NOT',
  'NY',
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
  'SUN',
  'SSR',
  'INT',
  'JET',
  'CO2',
]);

function titleCaseName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      if (/^(ii|iii|iv|jr|sr)$/i.test(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

/** Airline-style LAST/FIRST or LAST/FIRST MIDDLE → "First Middle Last". */
function fromAirlineNameOrder(raw: string): string | undefined {
  const cleaned = raw.replace(/^»\s*/, '').trim();
  const m = cleaned.match(/^([A-Z][A-Z'-]+)\s*\/\s*([A-Z][A-Z' -]+)$/i);
  if (!m) return undefined;
  const last = titleCaseName(m[1]);
  const first = titleCaseName(m[2]);
  return `${first} ${last}`.replace(/\s+/g, ' ').trim();
}

function toIsoDate(monthName: string, day: string, year: string): string | undefined {
  const mm = MONTHS[monthName.toLowerCase()];
  if (!mm) return undefined;
  const dd = day.padStart(2, '0');
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(dd)) return undefined;
  return `${year}-${mm}-${dd}`;
}

function looksLikeRecordLocator(code: string, opts?: { allowAlphaOnly?: boolean }): boolean {
  if (!/^[A-Z0-9]{5,8}$/i.test(code)) return false;
  if (/^(MANILA|BANGKOK|ECONOMY|CONFIRM|STATUS|FLIGHT|ISRAEL|DEPART|ARRIVE)$/i.test(code))
    return false;
  if (/\d/.test(code) && /[A-Z]/i.test(code)) return true;
  // Labeled agency PNRs are often 6 letters with no digit (e.g. ITBPRM).
  return Boolean(opts?.allowAlphaOnly && /^[A-Z]{6}$/i.test(code));
}

function extractCapitalOnePassengers(text: string): string[] {
  const names: string[] = [];
  const re = /^([A-Z][A-Z' -]{2,60})\s*\n\s*Base Fare\s*:?\s*\$?\s*[\d,.]+/gim;
  for (const match of text.matchAll(re)) {
    const name = match[1].replace(/\s+/g, ' ').trim();
    if (
      /^(YOUR|TOTAL|BASE|TAXES|CARD|CAPITAL|THAI|MANAGE|FARE|HELPFUL|CANCEL|PAYMENT|AIRLINE|CHECK|FREQUENTLY|TERMS|IMPORTANT|CONTACT|PLEASE|PRODUCTS|DEPARTING)/i.test(
        name,
      )
    )
      continue;
    if (name.split(/\s+/).length < 2) continue;
    names.push(titleCaseName(name));
  }
  return names;
}

function extractGdsPassengers(text: string): string[] {
  const names: string[] = [];
  // Prefer PREPARED FOR — eTicket / SSR rows glue seat, flight #, and ticket into the name.
  const prepared = text.match(
    /PREPARED FOR\s*([\s\S]{0,600}?)(?:RESERVATION CODE|AIRLINE RESERVATION|DEPARTURE:|$)/i,
  );
  if (prepared) {
    for (const line of prepared[1].split(/\r?\n/)) {
      const name = fromAirlineNameOrder(line.trim());
      if (name) names.push(name);
    }
  }
  if (names.length) return names;
  // Fallback: eTicket lines » LAST/FIRST…ticket (only when PREPARED FOR missing).
  for (const match of text.matchAll(
    /»\s*([A-Z][A-Z'-]+\/[A-Z][A-Z'-]+)(?=\d{2,}|\d*[A-Z]?\d{10,}|\s*$)/gim,
  )) {
    const name = fromAirlineNameOrder(match[1]);
    if (name) names.push(name);
  }
  return names;
}

function extractUnitedPassengers(text: string): string[] {
  const names: string[] = [];
  const block = text.match(
    /Travelers?\s*\n([\s\S]{0,400}?)(?:Seats:|Calculate bag|FLIGHT FIRST|Bags\.|$)/i,
  );
  if (!block) return names;
  for (const line of block[1].split(/\r?\n/)) {
    const trimmed = line.replace(/\s+/g, ' ').trim();
    if (!trimmed || /^(seats|ewr|tlv|jfk|lax|to|--)/i.test(trimmed)) continue;
    if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z'’-]+)+$/.test(trimmed)) names.push(trimmed);
  }
  return names;
}

/** American Express Travel: Traveler Information / Name (Adult|Child|Infant…) */
function extractAmexPassengers(text: string): string[] {
  const names: string[] = [];
  const block = text.match(
    /Traveler Information\s*([\s\S]{0,1200}?)(?:If you've submitted|Thursday,|Friday,|Saturday,|Sunday,|Monday,|Tuesday,|Wednesday,|DELTA|UNITED|Cost & Billing|$)/i,
  );
  if (!block) return names;
  for (const match of block[1].matchAll(
    /^([A-Z][A-Za-z' .-]+?)\s*\((?:Adult|Child|Infant[^)]*)\)\s*$/gim,
  )) {
    const name = match[1].replace(/\s+/g, ' ').trim();
    if (name.split(/\s+/).length >= 2) names.push(name);
  }
  return names;
}

/** Amex / hotel: Guest Name: Abraham Stefansky */
function extractHotelGuests(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/Guest Name\s*:\s*([A-Za-z][A-Za-z' .-]{1,80})/gi)) {
    const name = titleCaseName(match[1].replace(/\s+/g, ' ').trim());
    if (name.split(/\s+/).length >= 2 && !isAgencyImprintName(name)) names.push(name);
  }
  return names;
}

function extractPassengers(text: string): string[] {
  const names = [
    ...extractCapitalOnePassengers(text),
    ...extractGdsPassengers(text),
    ...extractUnitedPassengers(text),
    ...extractAmexPassengers(text),
    ...extractHotelGuests(text),
  ];
  return [...new Map(names.map((n) => [n.toLowerCase(), n])).values()];
}

function extractTickets(text: string): string[] {
  // Hotel confirmation digits are not airline tickets.
  if (isHotelConfirmation(text)) return [];
  const tickets: string[] = [];
  for (const match of text.matchAll(/Ticket\s*(?:Number|#)\s*:?\s*(\d{10,14})/gi)) {
    tickets.push(match[1]);
  }
  // GDS eTicket glued to name/seat: …37F1147449565267 or …1147572668516
  for (const match of text.matchAll(/»[^\n]*?(\d{13})\b/g)) {
    tickets.push(match[1]);
  }
  for (const match of text.matchAll(/\b(\d{13})\b/g)) {
    tickets.push(match[1]);
  }
  return [...new Set(tickets)];
}

function extractTotalUsd(text: string): string | undefined {
  const hotelTotal = text.match(/Total Cost\s*:?\s*\$?\s*([\d,]+\.\d{2})/i);
  if (hotelTotal) return hotelTotal[1].replace(/,/g, '');
  const tripCost = text.match(/Total Trip Cost\s*:?\s*\$?\s*([\d,]+\.\d{2})/i);
  if (tripCost) return tripCost[1].replace(/,/g, '');
  const compact = text.match(/Total\s*US\s*\$?\s*([\d,.]+)/i);
  if (compact) return compact[1].replace(/,/g, '');
  const spaced = text.match(/Total\s*[:\s]+US\s*\$\s*([\d,.]+)/i);
  if (spaced) return spaced[1].replace(/,/g, '');
  // United Gmail print often glues: Total$1,419.36
  const glued = text.match(/\bTotal\s*:?\s*\$?\s*([\d,]+\.\d{2})\b/i);
  if (glued) return glued[1].replace(/,/g, '');
  const plain = text.match(/\bTotal\s*:?\s*\$\s*([\d,.]+)/i);
  if (plain) return plain[1].replace(/,/g, '');
  return undefined;
}

function extractHotelProperty(text: string): string | undefined {
  // Repeated property line above street address (Amex hotel PDF).
  const repeated = text.match(
    /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+[A-Za-z]+\s+\d{1,2},\s+20\d{2}\s*\n+([A-Z][^\n]{3,90})\s*\n+\1\s*\n+\d{2,5}\s/i,
  );
  if (repeated?.[1]) return repeated[1].replace(/\s+/g, ' ').trim();
  const beforeConf = text.match(
    /\n([A-Z][A-Za-z0-9 &.'+/-]{4,90})\s*\n+\d{2,5}\s+[A-Za-z][^\n]*\n+[^\n]+\n+[A-Z]{2},?\s+United States[\s\S]{0,120}?Hotel Confirmation\s*#/i,
  );
  if (beforeConf?.[1] && !/^(Trip to|Check-in|Check-out|Room|Guest|Manage|Your trip)/i.test(beforeConf[1]))
    return beforeConf[1].replace(/\s+/g, ' ').trim();
  return undefined;
}

function extractHotelLocation(text: string): string | undefined {
  const tripTo = text.match(/Trip to\s+([A-Za-z][A-Za-z .'-]{2,60})/i)?.[1]?.trim();
  if (tripTo) return tripTo;
  // City line above "FL, United States" / "NY, United States"
  const city = text.match(
    /\n([A-Z][A-Za-z .'-]{2,40})\s*\n+[A-Z]{2},?\s+United States/i,
  )?.[1]?.trim();
  if (city && !/^(Check-in|Check-out|Room|Guest|Hotel|Manage)/i.test(city)) return city;
  return undefined;
}

function extractHotelConfirmation(text: string): string | undefined {
  return text.match(/Hotel Confirmation\s*#\s*:?\s*([A-Z0-9-]{6,20})\b/i)?.[1];
}

function extractRoomType(text: string): string | undefined {
  const m = text.match(/Room Type\s*:\s*([^\n]+)/i)?.[1]?.replace(/\s+/g, ' ').trim();
  return m || undefined;
}

function extractAirlineFlight(text: string): { airline?: string; flight?: string } {
  // Hotel Amex confirmations include trip #ZO-AX1099 — never a flight number.
  if (isHotelConfirmation(text)) return {};
  // Amex Travel: Flight Number:DL 249 — before dashed trip ids like ZO-AX1092.
  const numbered = [
    ...text.matchAll(/Flight Number:\s*([A-Z]{2})\s*(\d{1,4})\b/gi),
  ].map((m) => `${m[1].toUpperCase()}${m[2]}`);
  if (numbered.length) {
    const airlineRaw =
      text.match(
        /\b(DELTA AIR LINES|UNITED AIRLINES|AMERICAN AIRLINES|JETBLUE|ALASKA AIRLINES)\b/i,
      )?.[1] || undefined;
    return {
      airline: airlineRaw
        ? titleCaseName(airlineRaw.toLowerCase().replace(/\bair lines\b/g, 'Air Lines'))
        : undefined,
      flight: [...new Set(numbered)].join(', '),
    };
  }

  // United email: UA 84 / UA 91 under FLIGHT INFO
  const unitedFlights = [...text.matchAll(/\b(UA)\s+(\d{1,4})\b/gi)].map(
    (m) => `${m[1].toUpperCase()}${m[2]}`,
  );
  if (unitedFlights.length && /United Airlines/i.test(text)) {
    return {
      airline: 'United Airlines',
      flight: [...new Set(unitedFlights)].join(', '),
    };
  }

  // GDS: EL AL ISRAEL AIRLINES\nLY 2
  const gds = text.match(
    /((?:EL AL(?: ISRAEL)?(?: AIRLINES)?|Thai Airways|United(?: Airlines)?|Delta(?: Air Lines)?|American(?: Airlines)?|JetBlue|Alaska(?: Airlines)?|Southwest(?: Airlines)?|Air Canada|Emirates|Qatar(?: Airways)?|Singapore Airlines|Lufthansa|British Airways|Air France|KLM|Turkish Airlines)[^\n]*)\s*\n\s*([A-Z]{2})\s*(\d{1,4})\b/i,
  );
  if (gds) {
    const airline = gds[1].replace(/\s+/g, ' ').trim();
    return { airline, flight: `${gds[2].toUpperCase()}${gds[3]}` };
  }

  // Capital One style: "Thai Airways - TG617" (spaces around dash — not trip #ZO-AX1092)
  const dashed = text.match(
    /([A-Za-z][A-Za-z0-9 &.']{1,40}?)\s+-\s+([A-Z]{2}\d{1,4}[A-Z]?)\b/,
  );
  if (dashed) return { airline: dashed[1].trim(), flight: dashed[2].trim() };

  const spacedFlight = text.match(/\b([A-Z]{2})\s+(\d{1,4})\b/);
  if (spacedFlight && /AIRLINES|AIRWAYS|EL AL|UNITED|DELTA/i.test(text))
    return { flight: `${spacedFlight[1]}${spacedFlight[2]}` };

  const flightOnly = text.match(/\b([A-Z]{2}\d{2,4}[A-Z]?)\b/);
  return flightOnly ? { flight: flightOnly[1] } : {};
}

function extractRoute(text: string): string | undefined {
  // Prefer airport code pairs on their own lines (JFK\n...\nTLV).
  const lineCodes = [...text.matchAll(/(?:^|\n)\s*([A-Z]{3})\s*(?:\n|$)/g)]
    .map((m) => m[1])
    .filter((c) => !AIRPORT_SKIP.has(c));
  if (lineCodes.length >= 2 && lineCodes[0] !== lineCodes[1])
    return `${lineCodes[0]}-${lineCodes[1]}`;

  const codes = [...text.matchAll(/\b([A-Z]{3})\b/g)]
    .map((m) => m[1])
    .filter((c) => !AIRPORT_SKIP.has(c));
  for (let i = 0; i < codes.length - 1; i += 1) {
    if (codes[i] !== codes[i + 1]) return `${codes[i]}-${codes[i + 1]}`;
  }
  return undefined;
}

/** Drop Gmail/email chrome dates so we do not treat send-date as travel date. */
function itineraryDateSource(text: string): string {
  const stripped = text
    .replace(/^Date:\s*[^\n]+$/gim, '')
    // Gmail/email send stamps (line or glued after From:)
    .replace(
      /\b[A-Za-z]{3},\s+[A-Za-z]{3}\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s*[AP]M\b/gi,
      '',
    )
    .replace(/\d{1,2}\/\d{1,2}\/\d{2},\s+\d{1,2}:\d{2}\s*[AP]M\s*Gmail[^\n]*/gi, '');
  const zone = stripped.match(
    /(?:YOUR CONFIRMATION CODES|Flight to\b|Outbound to\b|PREPARED FOR|DEPARTURE:|Purchase summary)([\s\S]{0,3500}?)(?:Travelers?\b|SPECIAL REQUESTS|Calculate bag|Bags\.|Airline Fare Rules|Helpful Links|This email was sent|$)/i,
  );
  return zone?.[0] || stripped;
}

function collectIsoDates(source: string): string[] {
  // Take exactly 4 year digits — PDF text often glues duration ("20263h"); do not use \b/(?!\d).
  const shortDates = [
    ...source.matchAll(
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),\s*(20\d{2})/gi,
    ),
  ]
    .map((m) => toIsoDate(m[1], m[2], m[3]))
    .filter((d): d is string => Boolean(d));
  const longDates = [
    ...source.matchAll(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(20\d{2})/gi,
    ),
  ]
    .map((m) => toIsoDate(m[1], m[2], m[3]))
    .filter((d): d is string => Boolean(d));
  return [...new Set([...shortDates, ...longDates])].sort();
}

function extractTravelDates(text: string): { start?: string; end?: string } {
  // GDS header dates sit above PREPARED FOR — check full text first.
  const range = text.match(
    /\b(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[A-Z]*\s+(\d{4})\s+(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[A-Z]*\s+(\d{4})\b/i,
  );
  if (range) {
    return {
      start: toIsoDate(range[2], range[1], range[3]),
      end: toIsoDate(range[5], range[4], range[6]),
    };
  }

  // Amex / trip header: Jan 7, 2027 - Jan 17, 2027
  const tripSpan = text.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),\s*(20\d{2})\s*[-–—]\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),\s*(20\d{2})/i,
  );
  if (tripSpan) {
    return {
      start: toIsoDate(tripSpan[1], tripSpan[2], tripSpan[3]),
      end: toIsoDate(tripSpan[4], tripSpan[5], tripSpan[6]),
    };
  }

  const source = itineraryDateSource(text);
  const allDates = collectIsoDates(source);
  if (allDates.length >= 2) return { start: allDates[0], end: allDates[allDates.length - 1] };
  if (allDates.length === 1) return { start: allDates[0] };

  const year =
    source.match(/\b(20\d{2})/)?.[1] ||
    source.match(
      /\b(\d{1,2})\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+(20\d{2})/i,
    )?.[2];
  const departParen = source.match(
    /\(\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})\s*\)/i,
  );
  if (departParen && year)
    return { start: toIsoDate(departParen[1], departParen[2], year) };

  const departDay = source.match(
    /DEPARTURE:\s*(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)?\s*(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/i,
  );
  if (departDay && year) return { start: toIsoDate(departDay[2], departDay[1], year) };

  return {};
}

function extractCabin(text: string): string | undefined {
  const classOfTravel = text.match(
    /Class of Travel\s*:?\s*(Economy|Premium Economy|Business|First)\b/i,
  );
  if (classOfTravel) return classOfTravel[1];
  const united = text.match(/\bUnited\s+(Economy|Premium Economy|Business|First)\b/i);
  if (united) return united[1];
  const labeled = text.match(/Cabin\s*:?\s*\n?\s*(Economy|Premium Economy|Business|First)\b/i);
  if (labeled) return labeled[1];
  const m = text.match(/\b(Economy|Premium Economy|Business|First)\s+Cabin\b/i);
  return m ? m[1] : undefined;
}

function extractConfirmations(text: string): {
  airlinePnr?: string;
  sourceConf?: string;
} {
  const amexTrip = text.match(/Your trip #([A-Z0-9-]+)\s+is confirmed/i)?.[1];

  // Amex hotel: Hotel Confirmation # is the stay reference; trip # is source.
  if (isHotelConfirmation(text)) {
    const hotelConf = extractHotelConfirmation(text);
    return {
      airlinePnr: hotelConf,
      sourceConf: amexTrip?.toUpperCase(),
    };
  }

  // United: United confirmation number : PQNGJN
  const unitedConf = text.match(
    /United confirmation number\s*:?\s*([A-Z0-9]{5,8})\b/i,
  )?.[1];

  // Amex Travel: Airline Confirmation:GM6OLU · trip #ZO-AX1092-67178
  const amexAirline = text.match(/Airline Confirmation\s*:?\s*([A-Z0-9]{5,8})\b/i)?.[1];

  // GDS agency + airline PNRs (alpha-only 6-letter codes allowed when labeled).
  const agency = text.match(/(?<!AIRLINE\s)RESERVATION CODE\s+([A-Z0-9]{5,8})\b/i)?.[1];
  const airlineLabeled = text.match(
    /AIRLINE RESERVATION CODE\s*([A-Z0-9]{5,8})(?:\s*\([A-Z0-9]{2}\))?/i,
  )?.[1];

  // Capital One email body block
  const body = text.match(
    /To:\s*[^\n]+\n([\s\S]{0,1200}?)(?:Manage Your Trip|Fare Details|Helpful Links|JONATHAN|[A-Z]{2,} [A-Z]{2,} [A-Z]{2,}\nBase Fare)/i,
  );
  const zone = body?.[1] ?? text;
  const afterAirline = zone.match(
    /(?:Thai Airways|United(?: Airlines)?|Delta|American(?: Airlines)?|JetBlue|Alaska|Southwest|Air Canada|Emirates|Qatar|Singapore Airlines|ANA|JAL|Korean Air|Asiana|Cathay|EVA|Philippine Airlines|PAL|Cebu Pacific|EL AL)\s*\n\s*([A-Z0-9]{5,8})\b/i,
  )?.[1];
  const capitalOnePnr =
    afterAirline && looksLikeRecordLocator(afterAirline)
      ? afterAirline.toUpperCase()
      : [...zone.matchAll(/\b([A-Z0-9]{6})\b/g)]
          .map((m) => m[1])
          .find((c) => looksLikeRecordLocator(c) && !/^(TG|LY|UA|DL|AX)\d/i.test(c));
  const sourceConf =
    text.match(/Capital One Business Travel\s*\n\s*([A-Z0-9-]{5,12})\b/i)?.[1] ||
    amexTrip ||
    (agency && looksLikeRecordLocator(agency, { allowAlphaOnly: true }) ? agency : undefined);

  const airlinePnr =
    (amexAirline && looksLikeRecordLocator(amexAirline, { allowAlphaOnly: true })
      ? amexAirline.toUpperCase()
      : undefined) ||
    (unitedConf && looksLikeRecordLocator(unitedConf, { allowAlphaOnly: true })
      ? unitedConf.toUpperCase()
      : undefined) ||
    (airlineLabeled && looksLikeRecordLocator(airlineLabeled, { allowAlphaOnly: true })
      ? airlineLabeled.toUpperCase()
      : undefined) ||
    (capitalOnePnr && !/^(LY|AX)\d/i.test(capitalOnePnr) ? capitalOnePnr : undefined);

  return {
    airlinePnr,
    sourceConf: sourceConf?.toUpperCase(),
  };
}

function isCapitalOneConfirmation(text: string): boolean {
  if (/capital\s*one/i.test(text) && /confirmation/i.test(text)) return true;
  if (/YOUR CONFIRMATION CODES/i.test(text)) return true;
  if (/[A-Za-z].-\s*[A-Z]{2}\d{1,4}\b/.test(text) && /Ticket\s*#/i.test(text)) return true;
  return false;
}

function isUnitedConfirmation(text: string): boolean {
  if (/United confirmation number/i.test(text)) return true;
  if (/United Airlines/i.test(text) && /booking confirmation/i.test(text)) return true;
  if (/notifications@united\.com/i.test(text) && /\bUA\s+\d{1,4}\b/i.test(text)) return true;
  return false;
}

function isAmexTravelConfirmation(text: string): boolean {
  if (/American Express Travel/i.test(text) && /Your trip #/i.test(text)) return true;
  if (/Airline Confirmation\s*:/i.test(text) && /Traveler Information/i.test(text)) return true;
  if (/Confirmed:\s*your trip to/i.test(text) && /welcome\.americanexpress\.com/i.test(text))
    return true;
  return false;
}

/** Amex (or similar) hotel stay — not a flight itinerary. */
function isHotelConfirmation(text: string): boolean {
  if (/Hotel Confirmation\s*#/i.test(text)) return true;
  if (
    /Guest Name\s*:/i.test(text) &&
    /Check-in\s*:/i.test(text) &&
    !/Flight Number\s*:/i.test(text) &&
    !/Airline Confirmation\s*:/i.test(text)
  )
    return true;
  if (
    /Number of Nights\s*:/i.test(text) &&
    !/Flight Number\s*:/i.test(text) &&
    !/Traveler Information/i.test(text)
  )
    return true;
  return false;
}

function isGdsItinerary(text: string): boolean {
  if (/PREPARED FOR/i.test(text) && /RESERVATION CODE/i.test(text)) return true;
  if (/AIRLINE RESERVATION CODE/i.test(text) && /\b[A-Z]{2}\s+\d{1,4}\b/.test(text)) return true;
  if (/TRIP TO\b/i.test(text) && /eTicket Receipt/i.test(text)) return true;
  return false;
}

function hasRoundTripEvidence(text: string, dates: { start?: string; end?: string }): boolean {
  if (/RETURN(?:ING)?:/i.test(text)) return true;
  if (/ROUND\s*TRIP/i.test(text) && !/ONE\s*WAY/i.test(text)) return true;
  // United-style: Flight to X … Flight to Y on different dates
  const flightTos = [...text.matchAll(/Flight to\s+[A-Za-z .'-]+/gi)];
  if (flightTos.length >= 2 && dates.start && dates.end && dates.start !== dates.end) return true;
  const unitedFlights = [...text.matchAll(/\bUA\s+\d{1,4}\b/gi)];
  if (unitedFlights.length >= 2 && dates.start && dates.end && dates.start !== dates.end)
    return true;
  const numbered = [...text.matchAll(/Flight Number:\s*[A-Z]{2}\s*\d{1,4}/gi)];
  if (numbered.length >= 2 && dates.start && dates.end && dates.start !== dates.end) return true;
  // Amex trip span header with outbound+return flight days
  if (
    /Jan\s+\d+,\s*20\d{2}\s*[-–—]\s*Jan/i.test(text) &&
    numbered.length >= 2
  )
    return true;
  return false;
}

/**
 * Billed customer / account holder from confirmation evidence.
 * Never uses agency card imprint names (e.g. Padova Capital One cardholder).
 * When only travelers are listed, primary (first) traveler fills Customer for review.
 */
function extractCustomer(
  text: string,
  travelers: string[],
): { name?: string; source: 'labeled' | 'account' | 'thanks' | 'primary_traveler' | 'none' } {
  const labeled = text.match(
    /^(?:Customer|Client|Bill to|Booked by|Billing name)\s*:\s*(.+)$/im,
  );
  if (labeled?.[1]?.trim())
    return { name: titleCaseName(labeled[1].trim()), source: 'labeled' };

  // Amex Travel: account member under "Here are the details"
  const amex = text.match(
    /Here are the details\s*\n+\s*([A-Z][A-Z' .-]{2,60})\s*\n+\s*Account Ending/i,
  );
  if (amex?.[1]) {
    const accountName = titleCaseName(amex[1]);
    // Padova agency Amex imprint — prefer guest/traveler, not cardmember.
    if (!isAgencyImprintName(accountName))
      return { name: accountName, source: 'account' };
  }

  // United: Thanks Shoshana for choosing United!
  const thanks = text.match(/Thanks\s+([A-Za-z][A-Za-z'-]{1,40})\s+for choosing/i);
  if (thanks?.[1]) {
    const first = thanks[1].trim();
    const full = travelers.find(
      (t) =>
        t.toLowerCase() === first.toLowerCase() ||
        t.toLowerCase().startsWith(`${first.toLowerCase()} `),
    );
    return { name: full || titleCaseName(first), source: 'thanks' };
  }

  if (travelers.length) return { name: travelers[0], source: 'primary_traveler' };
  return { source: 'none' };
}

/** True when text looks like a reservation email/PDF itinerary, not Padova Field:Value paste. */
export function isReservationProse(raw: string): boolean {
  const text = raw.normalize('NFKC').trim();
  if (!text) return false;
  if (
    isGdsItinerary(text) ||
    isCapitalOneConfirmation(text) ||
    isUnitedConfirmation(text) ||
    isAmexTravelConfirmation(text) ||
    isHotelConfirmation(text)
  )
    return true;
  // Structured Padova paste — do not rewrite.
  if (PADOVA_PASTE_HEAD.test(text.slice(0, 800))) return false;
  return false;
}

/**
 * If prose reservation email/PDF, return Field: Value block for the paste parser.
 * Otherwise return the original text unchanged.
 */
export function normalizeReservationProseToPaste(raw: string): string {
  const text = raw.normalize('NFKC').replace(/\u00a0/g, ' ').trim();
  if (!text || !isReservationProse(text)) return raw;

  const lines: string[] = [];
  const hotel = isHotelConfirmation(text);
  const { airline, flight } = extractAirlineFlight(text);
  const route = hotel ? undefined : extractRoute(text);
  const dates = extractTravelDates(text);
  const cabin = hotel ? undefined : extractCabin(text);
  const passengers = extractPassengers(text);
  const tickets = extractTickets(text);
  const total = extractTotalUsd(text);
  const { airlinePnr, sourceConf } = extractConfirmations(text);
  const customer = extractCustomer(text, passengers);
  const property = hotel ? extractHotelProperty(text) : undefined;
  const location = hotel ? extractHotelLocation(text) : undefined;
  const roomType = hotel ? extractRoomType(text) : undefined;

  if (customer.name) lines.push(`Customer: ${customer.name}`);
  if (hotel) {
    lines.push('Product: Hotel');
    if (property) lines.push(`Hotel: ${property}`);
    if (location) lines.push(`Location: ${location}`);
    if (dates.start) lines.push(`Check-in: ${dates.start}`);
    if (dates.end && dates.end !== dates.start) lines.push(`Check-out: ${dates.end}`);
    if (airlinePnr) lines.push(`Confirmation #: ${airlinePnr}`);
    if (sourceConf && sourceConf !== airlinePnr)
      lines.push(`Booking source confirmation: ${sourceConf}`);
    if (passengers.length) lines.push(`Traveler: ${passengers.join(', ')}`);
    if (roomType) lines.push(`Room type: ${roomType}`);
  } else {
    lines.push('Product: Flight');
    if (airline) lines.push(`Airline: ${airline}`);
    if (flight) lines.push(`Flight numbers: ${flight}`);
    if (route) lines.push(`Route: ${route}`);
    if (dates.start) {
      lines.push(`Travel date: ${dates.start}`);
      const hasReturn = hasRoundTripEvidence(text, dates);
      if (dates.end && dates.end !== dates.start && hasReturn) {
        lines.push(`Return: ${dates.end}`);
        lines.push('Trip Type: Round Trip');
      } else {
        lines.push('Trip Type: One Way');
        if (dates.end && dates.end !== dates.start)
          lines.push(
            `Notes: Itinerary shows arrival ${dates.end} (overnight). Confirm trip type before Save.`,
          );
      }
    }
    if (cabin) lines.push(`Cabin: ${cabin}`);
    if (airlinePnr) lines.push(`Confirmation #: ${airlinePnr}`);
    if (sourceConf && sourceConf !== airlinePnr)
      lines.push(`Booking source confirmation: ${sourceConf}`);
    if (passengers.length) lines.push(`Traveler: ${passengers.join(', ')}`);
    if (tickets.length) lines.push(`Ticket numbers: ${tickets.join(', ')}`);
  }
  if (/capital\s*one\s+business\s+travel/i.test(text))
    lines.push('Booked Through: Capital One Business Travel');
  if (/American Express Travel/i.test(text) || isAmexTravelConfirmation(text))
    lines.push('Booked Through: American Express Travel');
  const pointsUsed = text.match(/Points used:\s*([\d,]+)/i)?.[1];
  const customerNote =
    customer.source === 'primary_traveler'
      ? hotel
        ? 'Customer set from guest name — confirm billed-to before Save.'
        : 'Customer set from primary traveler — confirm billed-to before Save.'
      : customer.source === 'account'
        ? 'Customer set from account/cardmember name — confirm billed-to before Save.'
        : customer.source === 'thanks'
          ? 'Customer set from confirmation greeting — confirm billed-to before Save.'
          : '';
  if (total) {
    lines.push(`Total: ${total}`);
    const bits = [
      'Total from reservation receipt — confirm customer price vs card/points charge before Save.',
      pointsUsed ? `Points used: ${pointsUsed}.` : '',
      customerNote,
    ].filter(Boolean);
    lines.push(`Notes: ${bits.join(' ')}`);
  } else if (customerNote) {
    if (!lines.some((l) => l.startsWith('Notes:'))) lines.push(`Notes: ${customerNote}`);
  } else if (!lines.some((l) => l.startsWith('Notes:'))) {
    lines.push(
      'Notes: Normalized from reservation email/PDF — review fields before Save.',
    );
  }

  // Only emit when we found at least one travel fact beyond Product.
  if (lines.length <= 2) return raw;
  return lines.join('\n');
}
