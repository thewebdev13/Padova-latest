import { classifyCampaign, parseSourceDate, type ImportBundle, type SourceItem } from './import';
import { hash } from './service';

export type CaptureRow = {
  row: number;
  cells: {
    cell: string;
    column: number;
    value: unknown;
    cached?: unknown;
    note?: string | null;
    hyperlink?: string | null;
  }[];
};
export type WorkbookCapture = {
  filename: string;
  sha256: string;
  sheets: {
    name: string;
    state: string;
    max_row: number;
    max_column: number;
    rows: CaptureRow[];
  }[];
};
export type WorkbookMetadata = {
  spreadsheetId: string;
  properties: { title: string; timeZone: string };
  sheets: { properties: { sheetId: number; title: string; index: number; hidden?: boolean } }[];
};
export const cell = (r: CaptureRow, n: number) =>
  String(r.cells.find((c) => c.column === n)?.value ?? '');
const original = (r: CaptureRow) =>
  r.cells
    .map(
      (c) =>
        `${c.cell}: ${String(c.value ?? '')}${c.note ? `\nCell note: ${c.note}` : ''}${c.hyperlink ? `\nHyperlink: ${c.hyperlink}` : ''}`,
    )
    .join('\n');
const legacy = (s: string) => (/^CH-\d+$/.test(s.trim()) ? s.trim() : undefined);
const emailDirection = (s: string) =>
  ({
    Sent: 'outbound',
    Received: 'inbound',
    'Automatic / system': 'automated',
    'Internal copy': 'internal',
    'Client forward': 'unknown',
  })[s] ?? 'unknown';
const usable = (s: string) =>
  s.trim() && !/^(?:not recorded|not confirmed|unknown|n\/a|none)$/i.test(s.trim());
const emails = (s: string) => [
  ...new Set(s.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []),
];

export function sourceMapping(crm: WorkbookCapture) {
  const external = new Map<string, Set<string>>(),
    embedded = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, key: string, id: string) => {
    if (!key || !id) return;
    const ids = map.get(key) ?? new Set<string>();
    ids.add(id);
    map.set(key, ids);
  };
  for (const r of crm.sheets[2].rows) {
    if (!/^SRC-/.test(cell(r, 1))) continue;
    const id = legacy(cell(r, 6));
    if (!id) continue;
    const url = cell(r, 11),
      file = url.match(/\/d\/([^/]+)/)?.[1],
      gid = url.match(/[?#&]gid=(\d+)/)?.[1],
      row = url.match(/range=[A-Z]+(\d+)/)?.[1];
    if (file && gid && row) add(external, `${file}:${gid}:${row}`, id);
    const local = cell(r, 12),
      localGid = local.match(/gid=(\d+)/)?.[1],
      localRow = local.match(/range=[A-Z]+(\d+)/)?.[1];
    if (localGid && localRow) add(embedded, `${localGid}:${localRow}`, id);
  }
  return { external, embedded };
}

/** Pure transformation. Every populated row produces exactly one preserved source item. */
export function normalizeWorkbook(
  capture: WorkbookCapture,
  metadata: WorkbookMetadata,
  crm: WorkbookCapture,
  isMain = false,
): ImportBundle[] {
  if (capture.sheets.length !== metadata.sheets.length)
    throw new Error('Workbook/tab metadata mismatch');
  const mappings = sourceMapping(crm),
    mailRows = new Map(crm.sheets[13].rows.slice(1).map((r) => [cell(r, 1), r]));
  return capture.sheets.map((sheet, index) => {
    const tab = metadata.sheets.find((s) => s.properties.index === index)?.properties;
    if (!tab) throw new Error('Missing original tab identity');
    const url = `https://docs.google.com/spreadsheets/d/${metadata.spreadsheetId}/edit#gid=${tab.sheetId}`;
    const key = `drive:${metadata.spreadsheetId}:${tab.sheetId}`;
    const exceptions: string[] = [];
    if (sheet.rows.some((r) => r.cells.some((c) => String(c.value).length >= 32767)))
      exceptions.push(
        'A cell reaches the Excel string limit; verify against the native source before claiming full text.',
      );
    const items = sheet.rows.map((row): SourceItem => {
      const item: SourceItem = {
        key: `row:${row.row}`,
        locator: `${tab.title}!A${row.row}`,
        sourceUrl: `${url}&range=A${row.row}`,
        originalTimezone: metadata.properties.timeZone,
        originalText: original(row),
        payload: {
          workbook: metadata.properties.title,
          workbookId: metadata.spreadsheetId,
          tab: tab.title,
          gid: tab.sheetId,
          row: row.row,
          hidden: !!tab.hidden,
          cells: row.cells,
        },
        kind: 'review',
        matchingMethod: 'No unique stable source mapping',
        reason: 'Incomplete or unmapped original row preserved for review',
      };
      const a = cell(row, 1);
      if (isMain && tab.sheetId === 100) {
        if (row.row <= 5) {
          item.kind = 'excluded';
          item.reason = 'Workbook title, dashboard or column heading; retained as source context';
          return item;
        }
        const id = legacy(a);
        if (!id) return item;
        item.kind = 'organization';
        item.legacyId = id;
        item.organizationLegacyId = id;
        item.originalStatus = cell(row, 4);
        item.matchingMethod = 'Existing CH identifier; separate branches retained';
        item.reason = 'Canonical CRM identity preserved; relationship remains unconfirmed';
        const contacts: { name: string; kind: string; value: string }[] = [];
        for (const value of emails(cell(row, 11)))
          contacts.push({ name: usable(cell(row, 14)) ? cell(row, 14) : '', kind: 'email', value });
        if (usable(cell(row, 12)))
          for (const value of cell(row, 12)
            .split(/\n|;|\|/)
            .map((v) => v.trim())
            .filter(Boolean))
            contacts.push({ name: '', kind: 'phone', value });
        for (const value of cell(row, 13).match(/https?:\/\/[^\s<>]+/g) ?? [])
          contacts.push({ name: '', kind: 'website', value });
        item.organization = {
          name: cell(row, 2),
          location: cell(row, 3),
          country: cell(row, 15),
          region: cell(row, 16),
          summary: cell(row, 10),
          contacts,
          nextAction: cell(row, 6),
          historicalStatus: cell(row, 9),
          review: [
            cell(row, 20),
            cell(row, 21)
              ? `Possible duplicate branches: ${cell(row, 21)}. Do not merge by shared contact alone.`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
          doNotContactReason: /do not contact|unsubscribe|remove from.*list/i.test(cell(row, 4))
            ? `Explicit source status: ${cell(row, 4)}`
            : undefined,
        };
      } else if (isMain && tab.sheetId === 101) {
        if (row.row === 1) {
          item.kind = 'excluded';
          item.reason = 'Column heading';
          return item;
        }
        item.legacyId = /^H-\d+$/.test(a) ? a : undefined;
        item.organizationLegacyId = legacy(cell(row, 2));
        item.originalStatus = cell(row, 6);
        item.originalDate = cell(row, 4) || undefined;
        const messageId = cell(row, 10).match(/^GMAIL:([a-f0-9]+)$/)?.[1],
          mail = messageId ? mailRows.get(messageId) : undefined;
        // Operational traveler messages remain source evidence; never expose their bodies as partnership history.
        if (/travel services|operational/i.test(cell(row, 6))) {
          item.kind = 'excluded';
          item.reason =
            'Unrelated operational/customer correspondence retained only in restricted source evidence';
          return item;
        }
        item.kind = 'interaction';
        item.matchingMethod = 'Preserved H identifier and explicit source CH mapping';
        item.reason = item.organizationLegacyId
          ? 'Full historical interaction; not current campaign acceptance'
          : 'Interaction retained without guessed organization';
        item.interaction = {
          kind: messageId
            ? 'email'
            : /whatsapp/i.test(cell(row, 8))
              ? 'whatsapp'
              : /phone|call/i.test(cell(row, 8))
                ? 'call'
                : 'note',
          direction: mail ? emailDirection(cell(mail, 11)) : 'unknown',
          body: cell(row, 9),
          subject: mail ? cell(mail, 10) : '',
          occurredAt: mail ? parseSourceDate(cell(mail, 5)).date : null,
          campaign: classifyCampaign(cell(row, 9)),
          accountKey: messageId ? 'bookings@padovatravels.com' : undefined,
          messageId,
          rfcMessageId: mail ? cell(mail, 3) : undefined,
        };
        if (mail) item.originalDate = cell(mail, 4);
      } else if (isMain && tab.sheetId === 209) {
        if (row.row === 1) {
          item.kind = 'excluded';
          item.reason = 'Column heading';
          return item;
        }
        item.organizationLegacyId = legacy(cell(row, 13));
        item.originalDate = cell(row, 4);
        item.originalStatus = cell(row, 12);
        if (/travel services|operational/i.test(cell(row, 12))) {
          item.kind = 'excluded';
          item.reason =
            'Unrelated operational/customer correspondence retained only in restricted source evidence';
          return item;
        }
        item.kind = 'interaction';
        item.matchingMethod =
          cell(row, 15) || 'Source CH mapping; ambiguous matches remain unresolved';
        item.reason = item.organizationLegacyId
          ? 'Full original archived email; account/message identity deduplicates timeline copies'
          : 'Unmatched email retained for identity review';
        item.interaction = {
          kind: 'email',
          direction: emailDirection(cell(row, 11)),
          body: cell(row, 16),
          subject: cell(row, 10),
          occurredAt: parseSourceDate(cell(row, 5)).date,
          campaign: classifyCampaign(cell(row, 16)),
          accountKey: 'bookings@padovatravels.com',
          messageId: a,
          rfcMessageId: cell(row, 3),
        };
      } else if (isMain && tab.sheetId === 103) {
        if (row.row === 1) {
          item.kind = 'excluded';
          item.reason = 'Column heading';
          return item;
        }
        item.legacyId = a;
        item.organizationLegacyId = legacy(cell(row, 14));
        item.originalDate = cell(row, 10) || undefined;
        item.originalStatus = cell(row, 11);
        item.kind = item.organizationLegacyId ? 'research' : 'review';
        item.matchingMethod = 'Explicit added CH identifier only';
        item.reason =
          'Existing research target retained; unresolved identities are not new confirmed organizations';
        item.research = {
          title: cell(row, 2),
          body: cell(row, 13),
          kind: 'research',
          observedOn: null,
          rank: null,
        };
      } else if (isMain && tab.sheetId === 102) {
        if (!/^SRC-/.test(a)) {
          item.kind = 'excluded';
          item.reason = 'Original import controls or heading preserved as context';
          return item;
        }
        item.kind = 'evidence';
        item.legacyId = a;
        item.organizationLegacyId = legacy(cell(row, 6));
        item.matchingMethod = `Prior source mapping retained (not independently strengthened): ${cell(row, 8)}`;
        item.reason = 'Original SRC mapping and uncertainty preserved';
      } else {
        const ids = isMain
          ? mappings.embedded.get(`${tab.sheetId}:${row.row}`)
          : mappings.external.get(`${metadata.spreadsheetId}:${tab.sheetId}:${row.row}`);
        if (ids?.size === 1) {
          item.kind = 'evidence';
          item.organizationLegacyId = [...ids][0];
          item.matchingMethod = 'Original Data stable workbook/tab/row mapping';
          item.reason = 'Supporting original row retained; no contact-based branch merge';
        } else if (row.row === 1 && /name|country|phone|chabad name/i.test(a)) {
          item.kind = 'excluded';
          item.reason = 'Original column heading preserved';
        }
      }
      return item;
    });
    return {
      key: `${key}:${capture.sha256}`,
      source: {
        key,
        title: `${metadata.properties.title} / ${tab.title}`,
        kind: 'spreadsheet',
        location: url,
        coverage: `All ${sheet.rows.length} populated rows; source tab grid ${sheet.max_row}×${sheet.max_column}; ${tab.hidden ? 'hidden' : 'visible'}. Original workbook SHA256 ${capture.sha256}.`,
        complete: !exceptions.length,
      },
      captureHash: capture.sha256,
      items,
      exceptions,
    };
  });
}

export type MailMessage = {
  id: string;
  thread_id: string;
  internal_date: string;
  label_ids?: string[];
  payload: {
    mime_type: string;
    filename?: string;
    headers: { name: string; value: string }[];
    body?: { content?: string; base64_url_content?: string; attachment_id?: string; size?: number };
    parts?: MailMessage['payload'][];
  };
};
export const header = (m: MailMessage, name: string) =>
  m.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
export function messageParts(p: MailMessage['payload']): MailMessage['payload'][] {
  return [p, ...(p.parts ?? []).flatMap(messageParts)];
}
export function messageText(m: MailMessage) {
  const parts = messageParts(m.payload),
    plain = parts
      .filter((p) => p.mime_type === 'text/plain' && !p.filename)
      .map((p) => p.body?.content ?? '')
      .filter(Boolean);
  if (plain.length) return plain.join('\n');
  return parts
    .filter((p) => p.mime_type === 'text/html' && !p.filename)
    .map((p) => p.body?.content ?? '')
    .join('\n');
}
export function normalizeMail(
  messages: MailMessage[],
  account: string,
  crm: WorkbookCapture,
  captureHash: string,
): ImportBundle {
  const archive = crm.sheets[13].rows.slice(1),
    threads = new Map<string, Set<string>>();
  for (const r of archive) {
    const id = legacy(cell(r, 13));
    if (!id) continue;
    const set = threads.get(cell(r, 2)) ?? new Set();
    set.add(id);
    threads.set(cell(r, 2), set);
  }
  const items = messages.map((m): SourceItem => {
    const originalRow = archive.find((r) => cell(r, 1) === m.id),
      threadIds = threads.get(m.thread_id),
      org = originalRow
        ? legacy(cell(originalRow, 13))
        : threadIds?.size === 1
          ? [...threadIds][0]
          : undefined;
    const body = messageText(m),
      subject = header(m, 'subject'),
      automatic = /delivery status|delivery notification|undeliver|mailer-daemon/i.test(
        subject + ' ' + header(m, 'from'),
      );
    const excluded =
      /newsletter|share request|annual charidy|fundraiser/i.test(subject) ||
      !!(originalRow && /travel services|operational/i.test(cell(originalRow, 12)));
    const direction = originalRow
      ? emailDirection(cell(originalRow, 11))
      : automatic
        ? 'automated'
        : m.label_ids?.includes('SENT')
          ? 'outbound'
          : 'inbound';
    return {
      key: m.id,
      locator: `${account}/${m.id}`,
      sourceUrl: `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(account)}#all/${m.id}`,
      originalDate: header(m, 'date'),
      originalTimezone: header(m, 'date').match(/(?:[+-]\d{4}|[A-Z]{3,5})$/)?.[0],
      originalStatus: direction,
      originalText: body,
      payload: { ...m },
      kind: excluded ? 'excluded' : 'interaction',
      organizationLegacyId: org,
      matchingMethod: originalRow
        ? 'Existing account/message identity'
        : org
          ? 'Unique prior thread-to-CH mapping'
          : 'Unmatched thread; no organization inferred from shared email',
      reason: excluded
        ? 'Unrelated newsletter, fundraiser or file-sharing notice'
        : automatic
          ? 'Delivery notice; verify recipient before new outreach'
          : org
            ? 'Original email preserved'
            : 'New correspondence requires organization/branch review',
      interaction: {
        kind: 'email',
        direction,
        body,
        subject,
        occurredAt: Number.isFinite(Number(m.internal_date))
          ? new Date(Number(m.internal_date)).toISOString()
          : null,
        campaign: classifyCampaign(body),
        accountKey: account,
        messageId: m.id,
        rfcMessageId: header(m, 'message-id'),
      },
    };
  });
  const attachments = messages.flatMap((m) =>
    messageParts(m.payload)
      .filter((p) => p.body?.attachment_id || p.filename)
      .map((p) => ({
        message: m.id,
        filename: p.filename,
        mime: p.mime_type,
        id: p.body?.attachment_id,
      })),
  );
  return {
    key: `gmail:${account}:${captureHash}`,
    source: {
      key: `gmail:${account}`,
      title: `Partnership correspondence / ${account}`,
      kind: 'email',
      location: `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(account)}`,
      coverage: `${messages.length} preserved message originals in this incremental capture. Manual refresh. Does not imply access to other inboxes.`,
      complete: attachments.length === 0,
    },
    captureHash,
    items,
    exceptions: attachments.length
      ? [
          `${attachments.length} attachment/inline MIME parts require private byte capture and reconciliation; see attachment inventory.`,
        ]
      : [],
  };
}

export function normalizedBatchHash(bundle: ImportBundle) {
  return hash(bundle);
}
