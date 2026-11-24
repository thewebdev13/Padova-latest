/**
 * Turn free-form reservation emails/PDFs into Field: Value lines for parseQuickPaste.
 * Supports Capital One Business Travel, Chase Travel / Travel Reservation Center,
 * GDS/agency itineraries, United, Amex Travel flights, Amex/Expedia TAAP/Marriott
 * (St. Regis) hotel confirmations.
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

/** Amex / hotel: Guest Name · Expedia Reserved for · Marriott thank-you / Additional Guests */
function extractHotelGuests(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/Guest Name\s*:\s*([A-Za-z][A-Za-z' .-]{1,80})/gi)) {
    const name = titleCaseName(match[1].replace(/\s+/g, ' ').trim());
    if (name.split(/\s+/).length >= 2 && !isAgencyImprintName(name)) names.push(name);
  }
  for (const match of text.matchAll(
    /Reserved for\s+([A-Za-z][A-Za-z' .-]{1,80}?)(?:\s*\n|\s+\d+\s+adults|\s*$)/gi,
  )) {
    const name = titleCaseName(match[1].replace(/\s+/g, ' ').trim());
    if (name.split(/\s+/).length >= 2 && !isAgencyImprintName(name)) names.push(name);
  }
  const thanksBooking = text.match(
    /Thank you for your booking,\s*([A-Za-z][A-Za-z' .-]{2,80}?)\s*\./i,
  );
  if (thanksBooking?.[1]) {
    const name = titleCaseName(thanksBooking[1].replace(/\s+/g, ' ').trim());
    if (name.split(/\s+/).length >= 2 && !isAgencyImprintName(name)) names.push(name);
  }
  // Marriott Gmail print often glues: Additional GuestsZachary Klein
  for (const match of text.matchAll(
    /Additional Guests?\s*:?\s*([A-Za-z][A-Za-z' .-]{2,80}?)(?:\s*\n|Number of rooms|Guests per room|$)/gi,
  )) {
    const name = titleCaseName(match[1].replace(/\s+/g, ' ').trim());
    if (name.split(/\s+/).length >= 2 && !isAgencyImprintName(name)) names.push(name);
  }
  return names;
}

/** Chase Travel: Traveler 1:Hinda Stefansky (colon often glued in Gmail print). */
function extractChaseTravelPassengers(text: string): string[] {
  if (!isChaseTravelConfirmation(text)) return [];
  const names: string[] = [];
  for (const match of text.matchAll(
    /Traveler\s*\d+\s*:\s*([A-Za-z][A-Za-z' .-]{1,80}?)(?:\s*\n|Important flight|Payment summary|$)/gi,
  )) {
    const name = titleCaseName(match[1].replace(/\s+/g, ' ').trim());
    if (name.split(/\s+/).length >= 2 && !isAgencyImprintName(name)) names.push(name);
  }
  return names;
}

/** Etihad / airline EMD “Receipt for your extras” — passenger under the logo. */
function extractEtihadPassengers(text: string): string[] {
  if (!isEtihadReceipt(text)) return [];
  const collapsed = text.replace(/[ \t]*\n[ \t]*/g, '\n').replace(/[ \t]+/g, ' ');
  const match =
    collapsed.match(
      /\b(Mrs?|Ms|Miss|Mstr?)\.?\s+([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,4})\b/,
    ) ||
    // PDF text layer sometimes splits title / name across lines.
    collapsed.match(
      /\b(Mrs?|Ms|Miss|Mstr?)\.?\s*\n\s*([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,4})\b/,
    );
  if (!match) return [];
  const title = match[1].toLowerCase().startsWith('mrs')
    ? 'Mrs'
    : match[1].toLowerCase().startsWith('miss')
      ? 'Miss'
      : match[1].toLowerCase().startsWith('ms')
        ? 'Ms'
        : match[1].toLowerCase().startsWith('mstr')
          ? 'Mstr'
          : 'Mr';
  const person = titleCaseName(match[2].replace(/\s+/g, ' ').trim());
  // Traveler may be the agency cardholder (e.g. Shmuel) — still keep as traveler.
  if (person.length < 3) return [];
  return [`${title} ${person}`];
}

function extractPassengers(text: string): string[] {
  const names = [
    ...extractEtihadPassengers(text),
    ...extractCapitalOnePassengers(text),
    ...extractGdsPassengers(text),
    ...extractUnitedPassengers(text),
    ...extractAmexPassengers(text),
    ...extractChaseTravelPassengers(text),
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
  // Seat / EMD extras receipts are not the customer flight sale — leave Sale blank.
  if (isEtihadExtrasReceipt(text)) return undefined;
  const hotelTotal = text.match(/Total Cost\s*:?\s*\$?\s*([\d,]+\.\d{2})/i);
  if (hotelTotal) return hotelTotal[1].replace(/,/g, '');
  const tripCost = text.match(/Total Trip Cost\s*:?\s*\$?\s*([\d,]+\.\d{2})/i);
  if (tripCost) return tripCost[1].replace(/,/g, '');
  // Chase Travel: Trip total$1,338.49
  const chaseTrip = text.match(/Trip total\s*:?\s*\$?\s*([\d,]+\.\d{2})\b/i);
  if (chaseTrip) return chaseTrip[1].replace(/,/g, '');
  const compact = text.match(/Total\s*US\s*\$?\s*([\d,.]+)/i);
  if (compact) return compact[1].replace(/,/g, '');
  const spaced = text.match(/Total\s*[:\s]+US\s*\$\s*([\d,.]+)/i);
  if (spaced) return spaced[1].replace(/,/g, '');
  // Expedia TAAP / Gmail print often splits: Total:\n$171.75
  const multiline = text.match(/\bTotal\s*:?\s*[\r\n]+\s*\$?\s*([\d,]+\.\d{2})\b/i);
  if (multiline) return multiline[1].replace(/,/g, '');
  // United Gmail print often glues: Total$1,419.36
  const glued = text.match(/\bTotal\s*:?\s*\$?\s*([\d,]+\.\d{2})\b/i);
  if (glued) return glued[1].replace(/,/g, '');
  const plain = text.match(/\bTotal\s*:?\s*\$\s*([\d,.]+)/i);
  if (plain) return plain[1].replace(/,/g, '');
  return undefined;
}

function extractHotelProperty(text: string): string | undefined {
  // Expedia TAAP: Stay at Hilton Garden Inn Buffalo Airport
  const stayAt = text.match(/Stay at\s+([^\n\r]{4,100})/i)?.[1]?.replace(/\s+/g, ' ').trim();
  if (stayAt && !/^(the property|this hotel)/i.test(stayAt)) return stayAt;
  // Subject / header: Reservation Confirmation #… for The St. Regis Rome
  const forProperty = text.match(
    /Reservation Confirmation\s*#?\s*\d+\s+for\s+([^\n\r]{4,90})/i,
  )?.[1]?.replace(/\s+/g, ' ').trim();
  if (forProperty && !isAgencyImprintName(forProperty)) return forProperty;
  // Marriott / St. Regis only: property name on its own line above Via …
  if (isMarriottHotelConfirmation(text)) {
    const marriott = text.match(
      /\n((?:The\s+)?St\.\s*Regis[^\n]{0,80})\s*\n+Via\s+/i,
    );
    if (marriott?.[1]) return marriott[1].replace(/\s+/g, ' ').trim();
  }
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
  // Expedia / street address: 4201 Genesee St, Buffalo, NY, 14225
  const streetCity = text.match(
    /\d{2,5}\s+[A-Za-z0-9 .'-]+,\s*([A-Za-z][A-Za-z .'-]{2,40}),\s*([A-Z]{2})\s*,?\s*\d{5}/i,
  );
  if (streetCity) return `${streetCity[1].trim()}, ${streetCity[2].toUpperCase()}`;
  // Marriott Italy: Via …, 3 Rome 00185 Italy
  const romeStyle = text.match(
    /(?:Via|Viale|Piazza|Calle)\s+[^\n]{3,60}?\b([A-Z][a-z]{2,40})\s+\d{5}\s+Italy/i,
  );
  if (romeStyle?.[1]) return romeStyle[1].trim();
  // City line above "FL, United States" / "NY, United States"
  const city = text.match(
    /\n([A-Z][A-Za-z .'-]{2,40})\s*\n+[A-Z]{2},?\s+United States/i,
  )?.[1]?.trim();
  if (city && !/^(Check-in|Check-out|Room|Guest|Hotel|Manage)/i.test(city)) return city;
  return undefined;
}

function extractHotelConfirmation(text: string): string | undefined {
  return (
    text.match(/Hotel Confirmation\s*#\s*:?\s*([A-Z0-9-]{6,20})\b/i)?.[1] ||
    text.match(/Confirmation Number\s*:\s*([A-Z0-9-]{6,20})\b/i)?.[1] ||
    text.match(/Reservation Confirmation\s*#\s*:?\s*([A-Z0-9-]{6,20})\b/i)?.[1] ||
    text.match(/Itinerary\s*#\s*:?\s*(\d{10,})\b/i)?.[1]
  );
}

function extractRoomType(text: string): string | undefined {
  const labeled = text.match(/Room Type\s*:?\s*([^\n]+)/i)?.[1]?.replace(/\s+/g, ' ').trim();
  if (labeled && !/^UPGRADE/i.test(labeled)) return labeled.replace(/^Type/i, '').trim() || labeled;
  // Marriott Gmail glue: Room Type1 King Bed, Superior Guest Room
  const glued = text.match(
    /Room Type\s*:?\s*(\d+\s+(?:King|Queen|Double|Twin|Full)[^\n]*?)(?:\n|UPGRADE|$)/i,
  )?.[1]?.replace(/\s+/g, ' ').trim();
  if (glued) return glued;
  // Expedia TAAP: Room\nRoom, 1 King Bed  or plain "Room, 1 King Bed"
  const taap = text.match(
    /\bRoom,\s*\d+\s+(?:King|Queen|Double|Twin|Full)(?:\s+Bed)?s?\b/i,
  )?.[0];
  if (taap) return taap.replace(/\s+/g, ' ').trim();
  return undefined;
}

/** Non-USD stay total — never invent FX into USD sale. */
function extractForeignStayTotal(
  text: string,
): { amount: string; currency: string } | undefined {
  const m = text.match(
    /Total for Stay\s*[\r\n]+\s*([\d,]+\.\d{2})\s*(EUR|GBP|CAD|CHF|AUD|JPY|ILS)\b/i,
  );
  if (m) return { amount: m[1].replace(/,/g, ''), currency: m[2].toUpperCase() };
  const inline = text.match(
    /Total for Stay\s*:?\s*([\d,]+\.\d{2})\s*(EUR|GBP|CAD|CHF|AUD|JPY|ILS)\b/i,
  );
  if (inline)
    return { amount: inline[1].replace(/,/g, ''), currency: inline[2].toUpperCase() };
  return undefined;
}

function extractAirlineFlight(text: string): { airline?: string; flight?: string } {
  // Hotel Amex confirmations include trip #ZO-AX1099 — never a flight number.
  if (isHotelConfirmation(text)) return {};
  if (isEtihadReceipt(text)) {
    return { airline: 'Etihad Airways' };
  }
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

  // United email / Chase Travel Gmail glue: UA 84 · UA 2692Boeing
  const unitedFlights = [...text.matchAll(/\b(UA)\s+(\d{1,4})(?!\d)/gi)].map(
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
  // Etihad fare calc: TLV EY AUH56.00USD56.00END
  const etihadFare = text.match(/\b([A-Z]{3})\s+EY\s+([A-Z]{3})\d/i);
  if (etihadFare && etihadFare[1] !== etihadFare[2])
    return `${etihadFare[1].toUpperCase()}-${etihadFare[2].toUpperCase()}`;

  // Chase Travel / Gmail: Newark (EWR)Los Angeles (LAX)
  const cityAirports = [
    ...text.matchAll(/\(([A-Z]{3})\)/g),
  ]
    .map((m) => m[1])
    .filter((c) => !AIRPORT_SKIP.has(c));
  if (cityAirports.length >= 2 && cityAirports[0] !== cityAirports[1])
    return `${cityAirports[0]}-${cityAirports[1]}`;

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
  // Marriott: Check-In:Sunday, July 5, 202603:00 PM (time may be glued)
  const checkIn = text.match(
    /Check-In\s*:\s*(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)?,?\s*(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s*(20\d{2})/i,
  );
  const checkOut = text.match(
    /Check-Out\s*:\s*(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)?,?\s*(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s*(20\d{2})/i,
  );
  if (checkIn || checkOut) {
    return {
      start: checkIn ? toIsoDate(checkIn[1], checkIn[2], checkIn[3]) : undefined,
      end: checkOut ? toIsoDate(checkOut[1], checkOut[2], checkOut[3]) : undefined,
    };
  }

  // Marriott header: Sun, Jul 05, 2026 – Tue, Jul 07, 2026
  const weekdaySpan = text.match(
    /\b(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*,?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s*(20\d{2})\s*[-– - ]\s*(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*,?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s*(20\d{2})/i,
  );
  if (weekdaySpan) {
    return {
      start: toIsoDate(weekdaySpan[1], weekdaySpan[2], weekdaySpan[3]),
      end: toIsoDate(weekdaySpan[4], weekdaySpan[5], weekdaySpan[6]),
    };
  }

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
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),\s*(20\d{2})\s*[-– - ]\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),\s*(20\d{2})/i,
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
  // Chase Travel: Fare:First Or Business · business class Z
  const chaseFare = text.match(
    /Fare\s*:\s*(?:First\s+Or\s+)?(Economy|Premium Economy|Business|First)\b/i,
  );
  if (chaseFare) return chaseFare[1];
  const businessClass = text.match(/\b(business|first|economy)\s+class\b/i);
  if (businessClass) return titleCaseName(businessClass[1]);
  const m = text.match(/\b(Economy|Premium Economy|Business|First)\s+Cabin\b/i);
  return m ? m[1] : undefined;
}

function extractConfirmations(text: string): {
  airlinePnr?: string;
  sourceConf?: string;
} {
  const amexTrip = text.match(/Your trip #([A-Z0-9-]+)\s+is confirmed/i)?.[1];

  // Amex / Expedia TAAP hotel: stay confirmation or itinerary #; trip # is source when present.
  if (isHotelConfirmation(text)) {
    const hotelConf = extractHotelConfirmation(text);
    const taapItinerary = text.match(/Itinerary\s*#\s*:?\s*(\d{10,})\b/i)?.[1];
    return {
      airlinePnr: hotelConf || taapItinerary,
      sourceConf: amexTrip?.toUpperCase() || (taapItinerary && hotelConf !== taapItinerary
        ? taapItinerary
        : undefined),
    };
  }

  // Etihad: Booking reference: 88MRHN (PDF layer may glue/split words)
  const etihadRef = text.match(
    /Booking\s*reference\s*:?\s*([A-Z0-9]{5,8})\b/i,
  )?.[1];

  // United: United confirmation number : PQNGJN
  const unitedConf = text.match(
    /United confirmation number\s*:?\s*([A-Z0-9]{5,8})\b/i,
  )?.[1];

  // Chase Travel / Amex: Airline confirmation: MKR22M · Airline Confirmation:GM6OLU
  const amexAirline = text.match(/Airline Confirmation\s*:?\s*([A-Z0-9]{5,8})\b/i)?.[1];
  const chaseTripId = text.match(
    /(?:Travel Reservation Center\s+)?Trip ID\s*#?\s*:?\s*(\d{7,})\b/i,
  )?.[1];

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
    chaseTripId ||
    (agency && looksLikeRecordLocator(agency, { allowAlphaOnly: true }) ? agency : undefined);

  const airlinePnr =
    (etihadRef && looksLikeRecordLocator(etihadRef, { allowAlphaOnly: true })
      ? etihadRef.toUpperCase()
      : undefined) ||
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

/** Chase Travel / Travel Reservation Center confirmation email. */
function isChaseTravelConfirmation(text: string): boolean {
  if (/donotreply@chasetravel\.com/i.test(text) && /Trip ID/i.test(text)) return true;
  if (/Chase Travel/i.test(text) && /Trip ID\s*#?\s*:?\s*\d{7,}/i.test(text)) return true;
  if (
    /Travel Reservation Center\s+Trip ID/i.test(text) &&
    /Airline confirmation\s*:/i.test(text)
  )
    return true;
  return false;
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

/** Expedia TAAP / Expedia Partner Solutions hotel confirmation. */
function isExpediaTaapHotel(text: string): boolean {
  if (/Flight Number\s*:/i.test(text) || /Airline Confirmation\s*:/i.test(text)) return false;
  if (/(?:Expedia\s+TAAP|expediataap\.com|Collected by TAAP)/i.test(text)) {
    if (/Stay at\s+/i.test(text) || /Reserved for\s+/i.test(text) || /Itinerary\s*#/i.test(text))
      return true;
  }
  if (/TAAP travel confirmation/i.test(text) && /Stay at\s+/i.test(text)) return true;
  return false;
}

/** Marriott / St. Regis / Bonvoy hotel confirmation email. */
function isMarriottHotelConfirmation(text: string): boolean {
  if (/Flight Number\s*:/i.test(text) || /Airline Confirmation\s*:/i.test(text)) return false;
  if (
    /(?:res-marriott\.com|Marriott International|Marriott Bonvoy|St\.\s*Regis Reservations)/i.test(
      text,
    ) &&
    (/Confirmation Number\s*:/i.test(text) || /Reservation Confirmation\s*#/i.test(text)) &&
    (/Check-In\s*:/i.test(text) || /Total for Stay/i.test(text))
  )
    return true;
  if (
    /Confirmation Number\s*:\s*\d{6,}/i.test(text) &&
    /Check-In\s*:/i.test(text) &&
    /Check-Out\s*:/i.test(text) &&
    /Total for Stay/i.test(text)
  )
    return true;
  return false;
}

/** Amex / Expedia TAAP / Marriott / similar hotel stay — not a flight itinerary. */
function isHotelConfirmation(text: string): boolean {
  if (isExpediaTaapHotel(text) || isMarriottHotelConfirmation(text)) return true;
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
    /Jan\s+\d+,\s*20\d{2}\s*[-– - ]\s*Jan/i.test(text) &&
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

  // Chase Travel: Email intended for: RAIZY FRIEDMAN (account ≠ traveler)
  const chaseEmailFor = text.match(
    /Email intended for\s*:\s*([A-Z][A-Z' .-]{2,60})/i,
  );
  if (chaseEmailFor?.[1]) {
    const accountName = titleCaseName(chaseEmailFor[1].replace(/\s+/g, ' ').trim());
    if (!isAgencyImprintName(accountName))
      return { name: accountName, source: 'account' };
  }

  // Marriott: Thank you for your booking, Martin Mittelman.
  const thanksBooking = text.match(
    /Thank you for your booking,\s*([A-Za-z][A-Za-z' .-]{2,80}?)\s*\./i,
  );
  if (thanksBooking?.[1]) {
    const name = titleCaseName(thanksBooking[1].replace(/\s+/g, ' ').trim());
    if (!isAgencyImprintName(name)) return { name, source: 'thanks' };
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

  // Chase Travel greeting: Hi RAIZY, — prefer full name from travelers only if match
  const chaseHi = text.match(/\bHi\s+([A-Z][A-Za-z'-]{1,40})\s*,/i);
  if (chaseHi?.[1] && isChaseTravelConfirmation(text)) {
    const first = chaseHi[1].trim();
    const full = travelers.find(
      (t) =>
        t.toLowerCase() === first.toLowerCase() ||
        t.toLowerCase().startsWith(`${first.toLowerCase()} `),
    );
    if (full) return { name: full, source: 'thanks' };
    // First-name-only greeting is not enough for billed-to — fall through to traveler.
  }

  if (travelers.length) return { name: travelers[0], source: 'primary_traveler' };
  return { source: 'none' };
}

/** Etihad purchase / EMD extras receipt PDF (or forwarded purchase mail body). */
function isEtihadReceipt(text: string): boolean {
  const t = text.replace(/\u00a0/g, ' ');
  if (/etihad/i.test(t) && /booking\s*reference\s*:?\s*[A-Z0-9]{5,8}/i.test(t)) return true;
  if (/etihad/i.test(t) && /receipt for your extras/i.test(t)) return true;
  if (/noreply@etihad\.com/i.test(t) && /thanks for your (purchase|order)/i.test(t)) return true;
  // Fare calc unique to Etihad EMD printouts even when branding OCR is weak.
  if (/\b[A-Z]{3}\s+EY\s+[A-Z]{3}\d/i.test(t) && /booking\s*reference\s*:?\s*[A-Z0-9]{5,8}/i.test(t))
    return true;
  return false;
}

/** Seat / ancillary EMD — not the base ticket sale. */
function isEtihadExtrasReceipt(text: string): boolean {
  return (
    isEtihadReceipt(text) &&
    (/receipt for your extras/i.test(text) ||
      /pre reserved seat/i.test(text) ||
      /electronic miscellaneous document/i.test(text))
  );
}

/** True when text looks like a reservation email/PDF itinerary, not Padova Field:Value paste. */
export function isReservationProse(raw: string): boolean {
  const text = raw.normalize('NFKC').trim();
  if (!text) return false;
  if (
    isGdsItinerary(text) ||
    isCapitalOneConfirmation(text) ||
    isChaseTravelConfirmation(text) ||
    isUnitedConfirmation(text) ||
    isAmexTravelConfirmation(text) ||
    isHotelConfirmation(text) ||
    isEtihadReceipt(text)
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
  const foreignTotal = hotel ? extractForeignStayTotal(text) : undefined;
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
  if (isChaseTravelConfirmation(text)) lines.push('Booked Through: Chase Travel');
  if (/American Express Travel/i.test(text) || isAmexTravelConfirmation(text))
    lines.push('Booked Through: American Express Travel');
  if (isExpediaTaapHotel(text)) lines.push('Booked Through: Expedia TAAP');
  if (isMarriottHotelConfirmation(text)) lines.push('Booked Through: Marriott');
  const pointsUsed =
    text.match(/Points used:\s*([\d,]+)/i)?.[1] ||
    text.match(/Points redeemed\s*:?\s*([\d,]+)\s*pts/i)?.[1] ||
    text.match(/([\d,]+)\s*pts redeemed/i)?.[1];
  const commissionable = /rate is commissionable/i.test(text);
  const customerNote =
    customer.source === 'primary_traveler'
      ? hotel
        ? 'Customer set from guest name, confirm billed-to before Save.'
        : 'Customer set from primary traveler, confirm billed-to before Save.'
      : customer.source === 'account'
        ? 'Customer set from account/cardmember name, confirm billed-to before Save.'
        : customer.source === 'thanks'
          ? 'Customer set from confirmation greeting, confirm billed-to before Save.'
          : '';
  if (isEtihadExtrasReceipt(text)) {
    const seat = text.match(/\bSeat\s*:?\s*([A-Z0-9]{1,4})\b/i)?.[1];
    const extrasTotal = text.match(/Total Amount\s*:?\s*USD\s*([\d,.]+)/i)?.[1];
    const bits = [
      'Etihad extras/EMD receipt, seat fee is not the flight sale; leave Sale blank until ticket price is known.',
      seat ? `Seat ${seat.toUpperCase()}.` : '',
      extrasTotal ? `Extras total USD ${extrasTotal.replace(/,/g, '')} on receipt.` : '',
      customerNote,
    ].filter(Boolean);
    if (!lines.some((l) => l.startsWith('Notes:'))) lines.push(`Notes: ${bits.join(' ')}`);
  } else if (total && !foreignTotal) {
    lines.push(`Total: ${total}`);
    const bits = [
      'Total from reservation receipt, confirm customer price vs card/points charge before Save.',
      pointsUsed ? `Points used: ${pointsUsed}.` : '',
      commissionable ? 'Confirmation says rate is commissionable.' : '',
      customerNote,
    ].filter(Boolean);
    lines.push(`Notes: ${bits.join(' ')}`);
  } else if (foreignTotal) {
    // Do not invent USD from EUR/GBP — staff enter customer price after FX review.
    const bits = [
      `Total for Stay ${foreignTotal.amount} ${foreignTotal.currency} on confirmation, not posted as USD; confirm customer price / FX before Save.`,
      commissionable ? 'Confirmation says rate is commissionable.' : '',
      customerNote,
    ].filter(Boolean);
    lines.push(`Notes: ${bits.join(' ')}`);
  } else if (customerNote) {
    if (!lines.some((l) => l.startsWith('Notes:'))) lines.push(`Notes: ${customerNote}`);
  } else if (!lines.some((l) => l.startsWith('Notes:'))) {
    lines.push(
      'Notes: Normalized from reservation email/PDF, review fields before Save.',
    );
  }

  // Only emit when we found at least one travel fact beyond Product.
  if (lines.length <= 2) return raw;
  return lines.join('\n');
}
