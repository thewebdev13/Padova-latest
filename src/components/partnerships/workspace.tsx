'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { stages, relationships, displayStage } from '@/lib/partnerships/contracts';
import styles from './workspace.module.css';
import SearchableSelect from '@/components/searchable-select';
import ListPager, { offsetMeta, pageSlice } from '@/components/list-pager';
import { FieldError, FormAlert } from '@/components/form-feedback';
import {
  isEmptyFieldValue,
  mapErrorMessageToFields,
  requiredFieldMessage,
  type FieldErrorMap,
} from '@/lib/form-field-errors';
type R = Record<string, any>;
const PAGE = 12;
const views = [
  ['queue', 'Work queue'],
  ['all', 'All organizations'],
  ['best', 'Best prospects'],
  ['due', 'Follow-ups due'],
  ['awaiting', 'Awaiting reply'],
  ['replies', 'Replies to review'],
  ['active', 'Active partners'],
  ['earlier_direct', 'Earlier direct referrals'],
  ['verification', 'Verify contacts'],
  ['outreach', 'Outreach approval'],
  ['hotels', 'Hotel directory'],
  ['sources', 'Imports & review'],
] as const;
const label = (v: unknown) => (v == null || v === '' ? 'Not recorded' : String(v));
const money = (v: unknown) =>
  v == null
    ? 'Unconfirmed'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
        Number(v) / 100,
      );
function Source({ href }: { href?: string | null }) {
  return href && /^https?:\/\//i.test(href) ? (
    <a href={href} target="_blank" rel="noreferrer">
      Original source ↗
    </a>
  ) : null;
}
type Field = {
  name: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  value?: unknown;
  lookup?: 'organizations' | 'bookings' | 'parties' | 'referrals';
  /** half = share a row in the modal grid; full = whole row */
  width?: 'half' | 'full';
  hint?: string;
  /** Visual section break before this field */
  section?: string;
};
function LookupField({ field }: { field: Field }) {
  const [value, setValue] = useState(String(field.value ?? '')),
    [query, setQuery] = useState(String(field.value ?? '')),
    [choices, setChoices] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/partnerships?view=choices&q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then(async (r) => {
          if (!r.ok) throw new Error('Lookup unavailable');
          return r.json();
        })
        .then((d) =>
          setChoices((old) => {
            const fresh = (d[field.lookup!] ?? []).map((r: R) => ({
              value: r.id,
              label: r.code
                ? `${r.code} · ${r.referrer ?? r.product ?? ''}`
                : `${r.name}${r.location ? ' · ' + r.location : ''}`,
            }));
            return [
              ...fresh,
              ...old.filter((o) => o.value === value && !fresh.some((f: R) => f.value === o.value)),
            ];
          }),
        )
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, field.lookup, value]);
  return (
    <div className={styles.lookupField}>
      <input type="hidden" name={field.name} value={value} />
      <SearchableSelect
        id={`partnership-${field.name}`}
        label={field.label}
        required={field.required}
        options={choices}
        value={value}
        onChange={setValue}
        onSearch={setQuery}
        allowClear
      />
    </div>
  );
}
function exactHundredths(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new Error('Use a nonnegative amount with at most two decimal places');
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (amount > 9000000000000n) throw new Error('Amount is too large');
  return Number(amount);
}
function EntryForm({
  title,
  fields,
  onSave,
  onClose,
  description,
}: {
  title: string;
  fields: Field[];
  onSave: (values: R) => Promise<void>;
  onClose: () => void;
  description?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({}),
    [attempted, setAttempted] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return;
      // Nested SearchableSelect / lookup menus handle Escape themselves.
      if (event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  const clearField = (name: string) =>
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const next: FieldErrorMap = {};
    for (const field of fields) {
      if (!field.required || field.lookup) continue;
      if (isEmptyFieldValue(data[field.name]))
        next[field.name] = requiredFieldMessage(field.label);
    }
    if (Object.keys(next).length) {
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      await onSave(data);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      const mapped = mapErrorMessageToFields(
        msg,
        fields.map((f) => f.name),
      );
      setFieldErrors(mapped.fieldErrors);
      setError(mapped.leftover || (Object.keys(mapped.fieldErrors).length ? '' : msg));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-label={title}>
        <header className={styles.modalHeader}>
          <div className={styles.modalHeaderCopy}>
            <h2>{title}</h2>
            {description ? <p className={styles.modalLead}>{description}</p> : null}
          </div>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="Close form"
            disabled={busy}
          >
            ×
          </button>
        </header>
        <form className={styles.modalForm} onSubmit={submit} noValidate>
          <div className={styles.modalFields}>
            {fields.map((field) => {
              const hasError = attempted && !!fieldErrors[field.name];
              const half = field.width === 'half';
              const control = field.lookup ? (
                <LookupField field={field} />
              ) : field.type === 'textarea' ? (
                <textarea
                  name={field.name}
                  defaultValue={String(field.value ?? '')}
                  rows={3}
                  onChange={() => clearField(field.name)}
                />
              ) : field.options ? (
                <select
                  name={field.name}
                  defaultValue={String(field.value ?? '')}
                  onChange={() => clearField(field.name)}
                >
                  {field.options.map((o) => (
                    <option value={o.value} key={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  name={field.name}
                  type={field.type ?? 'text'}
                  defaultValue={String(field.value ?? '')}
                  step={field.type === 'number' ? 'any' : undefined}
                  placeholder={
                    field.name === 'name'
                      ? 'Organization name'
                      : field.name === 'location'
                        ? 'City'
                        : field.name === 'service_areas'
                          ? 'e.g. Brooklyn, Manhattan'
                          : field.name === 'summary'
                            ? 'Short facts only'
                            : undefined
                  }
                  onChange={() => clearField(field.name)}
                />
              );
              return (
                <div
                  key={field.name}
                  className={[
                    styles.fieldBlock,
                    half ? styles.fieldHalf : '',
                    hasError ? styles.fieldHasError : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {field.section ? (
                    <p className={styles.fieldSection}>{field.section}</p>
                  ) : null}
                  <div className={styles.fieldStack}>
                    <div className={styles.fieldHead}>
                      <span className={styles.fieldLabelText}>
                        {field.label}
                        {field.required ? <em className={styles.reqMark}>*</em> : null}
                      </span>
                      {field.hint && !hasError ? (
                        <small className={styles.fieldHint}>{field.hint}</small>
                      ) : null}
                    </div>
                    <div className={styles.fieldControl}>{control}</div>
                    {hasError ? <FieldError>{fieldErrors[field.name]}</FieldError> : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className={styles.modalAlertWrap}>
            <FormAlert onDismiss={() => setError('')}>{error}</FormAlert>
          </div>
          <footer className={styles.modalFooter}>
            <button type="button" className={styles.ghostBtn} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
const options = (values: readonly string[]) =>
  values.map((value) => ({ value, label: displayStage(value) }));
const f = (
  name: string,
  label: string,
  value: unknown = '',
  type = 'text',
  required = false,
): Field => ({ name, label, value, type, required });
export default function Partnerships() {
  const pendingCommands = useRef(new Map<string, string>());
  const detailSection = useRef<HTMLElement>(null);
  const [view, setView] = useState('queue'),
    [search, setSearch] = useState(''),
    [filters, setFilters] = useState<R>({}),
    [offset, setOffset] = useState(0),
    [state, setState] = useState<R | null>(null),
    [detail, setDetail] = useState<R | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [tab, setTab] = useState('History'),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [form, setForm] = useState<{
      title: string;
      fields: Field[];
      onSave: (values: R) => Promise<void>;
      description?: string;
    } | null>(null),
    [notice, setNotice] = useState(''),
    [hotels, setHotels] = useState<R[]>([]);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (view === 'hotels') {
        const p = new URLSearchParams({ q: search });
        if (filters.location) p.set('location', String(filters.location));
        const response = await fetch(`/api/hotel-directory?${p}`),
          data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setHotels(data.hotels ?? []);
        setState({ enabled: data.enabled, note: data.note, hotels: data.hotels ?? [] });
        setSelected(null);
        setDetail(null);
        return;
      }
      const p = new URLSearchParams({
        view,
        q: search,
        offset: String(offset),
        limit: String(PAGE),
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      });
      const response = await fetch(`/api/partnerships?${p}`),
        data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setState(data);
      if (selected) {
        const r = await fetch(`/api/partnerships?id=${selected}`),
          d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setDetail(d);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load partnerships');
    } finally {
      setLoading(false);
    }
  }, [view, search, offset, filters, selected]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 180);
    return () => clearTimeout(timer);
  }, [load]);
  const can = (permission: string) =>
    state?.actor?.role === 'OWNER' || state?.actor?.permissions?.includes(permission);
  useEffect(() => {
    if (detail?.organization?.id)
      detailSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [detail?.organization?.id]);
  const save = async (kind: string, data: R, reason = 'Staff update from Partnerships') => {
    const key = JSON.stringify({ actor: state?.actor?.id, kind, data, reason });
    const id = pendingCommands.current.get(key) ?? crypto.randomUUID();
    pendingCommands.current.set(key, id);
    const r = await fetch('/api/partnerships', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, kind, data, reason }),
    });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error);
    pendingCommands.current.delete(key);
    await load();
    return result.result;
  };
  const action = async (fn: () => Promise<unknown>) => {
    try {
      setError('');
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    }
  };
  const open = (id: string) => {
    setSelected(id);
    setTab('History');
  };
  const org = detail?.organization;
  const organizationForm = (existing?: R) =>
    setForm({
      title: existing ? 'Edit organization' : 'Add organization',
      description: 'Affiliate referring org. Leave unknown fields blank.',
      fields: [
        {
          ...f('name', 'Organization / branch name', existing?.name, 'text', true),
          width: 'full',
        },
        {
          ...f('location', 'City / location', existing?.location),
          width: 'half',
        },
        {
          ...f('country', 'Country', existing?.country),
          width: 'half',
        },
        {
          ...f('region', 'Region', existing?.region),
          width: 'half',
        },
        {
          ...f('service_areas', 'Service areas', existing?.service_areas),
          width: 'half',
        },
        {
          ...f('summary', 'Factual summary', existing?.summary, 'textarea'),
          width: 'full',
        },
        {
          ...f('parent_id', 'Parent organization', existing?.parent_id),
          lookup: 'organizations',
          width: 'full',
          section: 'Optional links',
        },
        ...(can('manage_commissions')
          ? [
              {
                ...f(
                  'accounting_party_id',
                  'Referral account in People',
                  existing?.accounting_party_id,
                ),
                lookup: 'parties' as const,
                width: 'full' as const,
              },
            ]
          : []),
      ],
      onSave: async (d) => {
        const result = await save('organization', {
          ...d,
          parent_id: d.parent_id || null,
          ...(can('manage_commissions')
            ? { accounting_party_id: d.accounting_party_id || null }
            : {}),
          ...(existing ? { id: existing.id, version: existing.version } : {}),
        });
        setSelected(result.id);
      },
    });
  const opportunityForm = (existing?: R, reviewReply = false) =>
    setForm({
      title: reviewReply
        ? 'Review reply and plan next action'
        : existing
          ? 'Update opportunity'
          : 'Add opportunity',
      fields: [
        ...(!reviewReply
          ? [
              {
                name: 'campaign_id',
                label: 'Campaign',
                options: (state?.campaigns ?? detail?.campaigns ?? []).map((c: R) => ({
                  value: c.id,
                  label: c.name,
                })),
                value: existing?.campaign_id ?? state?.campaigns?.find((c: R) => !c.historical)?.id,
                required: true,
              },
              {
                name: 'stage',
                label: 'Opportunity stage',
                options: options(stages),
                value: existing?.stage ?? 'needs_research',
              },
              {
                name: 'owner_id',
                label: 'Responsible staff member',
                options: (state?.owners ?? detail?.owners ?? []).map((o: R) => ({
                  value: o.id,
                  label: o.name,
                })),
                value: existing?.owner_id ?? state?.actor?.id,
                required: true,
              },
              f(
                'priority',
                'Priority (1 highest, 5 lowest)',
                existing?.priority ?? 3,
                'number',
                true,
              ),
            ]
          : []),
        f('next_action', 'Next action', existing?.next_action, 'text', true),
        f('due_on', 'Follow-up date', existing?.due_on, 'date'),
        f('unscheduled_reason', 'Reason if unscheduled', existing?.unscheduled_reason),
        ...(!reviewReply
          ? [f('rationale', 'Why this prospect / next action', existing?.rationale, 'textarea')]
          : []),
      ],
      onSave: async (d) => {
        await save(
          reviewReply ? 'review_reply' : 'opportunity',
          {
            ...d,
            due_on: d.due_on || null,
            unscheduled_reason: d.unscheduled_reason || null,
            ...(!reviewReply ? { organization_id: org.id, priority: Number(d.priority) } : {}),
            ...(existing ? { id: existing.id, version: existing.version } : {}),
          },
          reviewReply
            ? 'Staff reviewed the new reply and chose the next action'
            : 'Opportunity planning update',
        );
      },
    });
  const logForm = (kind = 'note') =>
    setForm({
      title: kind === 'call' ? 'Log a call' : 'Add interaction',
      fields: [
        {
          name: 'kind',
          label: 'Type',
          options: options(['note', 'call', 'email', 'whatsapp', 'meeting']),
          value: kind,
        },
        {
          name: 'direction',
          label: 'Direction',
          options: options(['internal', 'inbound', 'outbound', 'unknown', 'automated']),
          value: kind === 'note' ? 'internal' : 'unknown',
        },
        f('subject', 'Subject'),
        f('body', 'Full note / conversation', '', 'textarea', true),
        f('occurred_at', 'When it happened (optional; your local time)', '', 'datetime-local'),
        f('original_date', 'Original date, if known (leave blank if undated)'),
        f('original_timezone', 'Original timezone, if known'),
        f('source_url', 'Source link (optional)', '', 'url'),
      ],
      onSave: async (d) => {
        await save('interaction', {
          ...d,
          organization_id: org.id,
          campaign_id: null,
          occurred_at: d.occurred_at ? new Date(d.occurred_at).toISOString() : null,
          original_date: d.original_date || null,
          original_timezone: d.original_timezone || null,
          source_url: d.source_url || null,
        });
      },
    });
  const contactForm = (c?: R) =>
    setForm({
      title: c ? 'Edit contact' : 'Add contact',
      fields: [
        f('name', 'Contact name', c?.name, 'text', true),
        f('role_title', 'Role', c?.role_title),
        f('preferred_channel', 'Preferred channel', c?.preferred_channel),
        {
          name: 'verification',
          label: 'Verification',
          options: options(['unverified', 'verified', 'invalid']),
          value: c?.verification ?? 'unverified',
        },
        {
          name: 'do_not_contact',
          label: 'Contact permission',
          options: [
            { value: 'false', label: 'No recorded suppression' },
            { value: 'true', label: 'Do not contact' },
          ],
          value: String(c?.do_not_contact ?? false),
        },
      ],
      onSave: async (d) => {
        await save('contact', {
          ...d,
          organization_id: org.id,
          do_not_contact: d.do_not_contact === 'true',
          ...(c ? { id: c.id, version: c.version } : {}),
        });
      },
    });
  const methodForm = (m?: R) =>
    setForm({
      title: m ? 'Edit contact detail' : 'Add contact detail',
      fields: [
        {
          name: 'contact_id',
          label: 'Contact',
          options: [
            { value: '', label: 'Organization contact' },
            ...(detail?.contacts ?? []).map((c: R) => ({ value: c.id, label: c.name })),
          ],
          value: m?.contact_id ?? '',
        },
        {
          name: 'kind',
          label: 'Channel',
          options: options(['email', 'phone', 'whatsapp', 'website', 'other']),
          value: m?.kind ?? 'email',
        },
        f('value', 'Address / number / URL', m?.value, 'text', true),
        {
          name: 'verification',
          label: 'Verification',
          options: options(['unverified', 'verified', 'invalid']),
          value: m?.verification ?? 'unverified',
        },
        f('source_url', 'Verification source', m?.source_url, 'url'),
        {
          name: 'do_not_contact',
          label: 'Contact permission',
          options: [
            { value: 'false', label: 'No recorded suppression' },
            { value: 'true', label: 'Do not contact' },
          ],
          value: String(m?.do_not_contact ?? false),
        },
      ],
      onSave: async (d) => {
        await save('contact_method', {
          ...d,
          organization_id: org.id,
          contact_id: d.contact_id || null,
          source_url: d.source_url || null,
          do_not_contact: d.do_not_contact === 'true',
          ...(m ? { id: m.id, version: m.version } : {}),
        });
      },
    });
  const hotelDirectoryForm = (row?: R) =>
    setForm({
      title: row ? 'Edit hotel directory entry' : 'Add hotel by location',
      description:
        'Corp code, IATA, hotel commission, and best book method. Leave unknown fields blank.',
      fields: [
        f('location', 'Location / city', row?.location ?? '', 'text', true),
        f('hotel_name', 'Hotel name', row?.hotel_name ?? '', 'text', true),
        f('corporate_code', 'Corporate / corp code', row?.corporate_code ?? ''),
        f('iata_code', 'IATA / hotel code', row?.iata_code ?? ''),
        f('hotel_commission', 'Hotel commission (text)', row?.hotel_commission ?? ''),
        f(
          'commission_rate_bps',
          'Commission rate in basis points (optional; 1000 = 10%)',
          row?.commission_rate_bps ?? '',
          'number',
        ),
        f('best_book_method', 'Best book method', row?.best_book_method ?? ''),
        f('discounts', 'Discounts / negotiated notes', row?.discounts ?? '', 'textarea'),
        f('notes', 'Notes', row?.notes ?? '', 'textarea'),
        {
          name: 'organization_id',
          label: 'Linked organization (optional)',
          lookup: 'organizations',
          value: row?.organization_id ?? '',
        },
        {
          name: 'status',
          label: 'Status',
          options: [
            { value: 'active', label: 'Active' },
            { value: 'archived', label: 'Archived' },
          ],
          value: row?.status ?? 'active',
        },
      ],
      onSave: async (d) => {
        const payload = {
          ...d,
          commission_rate_bps:
            d.commission_rate_bps === '' || d.commission_rate_bps == null
              ? null
              : Number(d.commission_rate_bps),
          organization_id: d.organization_id || null,
          ...(row ? { id: row.id, version: row.version } : {}),
        };
        const response = await fetch('/api/hotel-directory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Hotel save failed');
        setNotice(row ? 'Hotel directory entry updated' : 'Hotel directory entry added');
        await load();
      },
    });
  const researchForm = () =>
    setForm({
      title: 'Add sourced research',
      fields: [
        {
          name: 'kind',
          label: 'Finding',
          options: options([
            'research',
            'hotel_recommendation',
            'hotel_agreement',
            'restriction',
            'published_contact',
            'reported_inquiry',
          ]),
        },
        f('title', 'Title', '', 'text', true),
        f('body', 'Full finding / evidence', '', 'textarea', true),
        f('source_url', 'Source URL', '', 'url', true),
        f('observed_on', 'Date observed', '', 'date'),
        f('verified_on', 'Date independently verified', '', 'date'),
        f('rank', 'Research shortlist rank (optional)', '', 'number'),
      ],
      onSave: async (d) => {
        await save('research', {
          ...d,
          organization_id: org.id,
          observed_on: d.observed_on || null,
          verified_on: d.verified_on || null,
          rank: d.rank ? Number(d.rank) : null,
        });
      },
    });
  const relationshipForm = () =>
    setForm({
      title: 'Update current relationship',
      description:
        'Active requires an accepted agreement with evidence and effective dates. Historical interest alone does not confirm a partnership.',
      fields: [
        {
          name: 'relationship',
          label: 'Current relationship',
          options: options(relationships),
          value: org.relationship,
        },
        f('dnc_reason', 'Do-not-contact reason, if applicable', org.dnc_reason),
        f('reason', 'Reason for this change', '', 'text', true),
      ],
      onSave: async (d) => {
        await save(
          'relationship',
          {
            id: org.id,
            version: org.version,
            relationship: d.relationship,
            dnc_reason: d.dnc_reason || null,
          },
          d.reason,
        );
      },
    });
  const agreementForm = () =>
    setForm({
      title: 'Record versioned agreement',
      description:
        'For booking Referring org dropdown: status=accepted, Effective start ≤ today, and Explicit percentage or fixed terms. Also link Existing referral account on the org.',
      fields: [
        {
          name: 'status',
          label: 'Agreement status',
          options: options(['unconfirmed', 'proposed', 'accepted', 'ended', 'superseded']),
          value: 'accepted',
          hint: 'Use accepted so the org appears on New Booking',
          width: 'full',
        },
        {
          ...f('original_wording', 'Original agreed / proposed wording', '', 'textarea', true),
          width: 'full',
          hint: 'Paste or type the deal wording, do not invent money beyond what was agreed',
        },
        {
          ...f('confirmed_on', 'Confirmation date', '', 'date'),
          width: 'half',
        },
        {
          ...f('confirmation_method', 'How was it confirmed?'),
          width: 'half',
        },
        {
          ...f('evidence_url', 'Confirmation evidence URL', '', 'url'),
          width: 'full',
        },
        {
          ...f('starts_on', 'Effective start', '', 'date'),
          width: 'half',
          hint: 'Must be today or earlier for booking dropdown',
          section: 'Effective dates',
        },
        {
          ...f('ends_on', 'Effective end', '', 'date'),
          width: 'half',
          hint: 'Leave blank if open-ended',
        },
        {
          name: 'calculation',
          label: 'Commission terms',
          options: [
            { value: '', label: 'Unconfirmed / no monetary terms' },
            { value: 'fixed', label: 'Explicit fixed USD amount' },
            { value: 'percentage', label: 'Explicit percentage' },
          ],
          value: 'percentage',
          section: 'Commission terms (required for booking affiliate)',
          hint: 'Pick Explicit percentage for a typical ~20% of profit deal',
          width: 'full',
        },
        {
          ...f('fixed_amount', 'Fixed amount (USD)', '', 'number'),
          width: 'half',
        },
        {
          ...f('rate', 'Percentage (for example 15)', '', 'number'),
          width: 'half',
          hint: 'e.g. 20 for 20%',
        },
        {
          ...f(
            'agreed_basis',
            'Agreed basis amount (USD, only for agreed-amount percentage)',
            '',
            'number',
          ),
          width: 'half',
        },
        {
          ...f('due_on', 'Agreed payment date (only for On date)', '', 'date'),
          width: 'half',
        },
        {
          name: 'percentage_basis',
          label: 'Percentage basis',
          options: [
            { value: '', label: 'Unconfirmed' },
            ...options(['profit', 'sale', 'commission', 'commission_received', 'agreed_amount']),
          ],
          value: 'profit',
          width: 'half',
        },
        {
          name: 'payable_when',
          label: 'Payment timing',
          options: [
            { value: '', label: 'Unconfirmed' },
            ...[
              'When earned',
              'After travel',
              'After customer paid',
              'After commission received',
              'On date',
            ].map((value) => ({ value, label: value })),
          ],
          value: 'After travel',
          width: 'half',
        },
        {
          ...f('eligibility', 'Eligibility conditions', '', 'textarea'),
          width: 'full',
        },
        {
          name: 'cancellation_rule',
          label: 'Cancellation / refund rule',
          options: [
            { value: '', label: 'Unconfirmed' },
            ...['Realized economics', 'Retain agreed amount'].map((value) => ({
              value,
              label: value,
            })),
          ],
          value: 'Realized economics',
          width: 'full',
        },
      ],
      onSave: async (d) => {
        const previous = detail?.agreements[0];
        const terms = d.calculation
          ? {
              calculation: d.calculation,
              fixed_amount: d.fixed_amount === '' ? null : exactHundredths(d.fixed_amount),
              rate_bps: d.rate === '' ? null : exactHundredths(d.rate),
              percentage_basis: d.percentage_basis || null,
              agreed_basis: d.agreed_basis === '' ? null : exactHundredths(d.agreed_basis),
              due_on: d.due_on || null,
              payable_when: d.payable_when,
              eligibility: d.eligibility,
              cancellation_rule: d.cancellation_rule,
              currency: 'USD',
            }
          : null;
        await save('agreement', {
          organization_id: org.id,
          version: Number(previous?.version ?? 0) + 1,
          supersedes_id: previous?.id ?? null,
          status: d.status,
          original_wording: d.original_wording,
          confirmed_on: d.confirmed_on || null,
          confirmation_method: d.confirmation_method || null,
          evidence_url: d.evidence_url || null,
          starts_on: d.starts_on || null,
          ends_on: d.ends_on || null,
          terms,
        });
      },
    });
  const prepareDraft = async (opportunity: R) => {
    const methods =
      detail?.methods.filter(
        (m: R) =>
          m.verification === 'verified' &&
          !m.do_not_contact &&
          ['email', 'phone', 'whatsapp'].includes(m.kind),
      ) ?? [];
    if (!methods.length) throw new Error('Add and verify a recipient in Contacts first');
    const response = await fetch(
        `/api/partnerships?id=${org.id}&recommend=1&opportunity=${opportunity.id}&method=${methods[0].id}`,
      ),
      draft = await response.json();
    if (!response.ok) throw new Error(draft.error);
    setForm({
      title: 'Review personalized draft',
      description: `Why: ${draft.rationale}. Previous discussion is shown in the history. Saving creates a draft for approval; no message is sent.`,
      fields: [
        {
          name: 'method_id',
          label: 'Specific recipient',
          options: methods.map((m: R) => ({ value: m.id, label: `${m.kind}: ${m.value}` })),
        },
        f('subject', 'Subject', draft.subject, 'text', true),
        f('body', 'Message', draft.body, 'textarea', true),
      ],
      onSave: async (d) => {
        await save('draft', { opportunity_id: opportunity.id, ...d });
        setTab('Drafts');
      },
    });
  };
  async function upload(file: File) {
    const bytes = await file.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const key = JSON.stringify({ actor: state?.actor?.id, org: org.id, name: file.name, digest });
    const commandId = pendingCommands.current.get(key) ?? crypto.randomUUID();
    pendingCommands.current.set(key, commandId);
    const data = new FormData();
    data.append('file', file);
    data.append('organization_id', org.id);
    data.append('command_id', commandId);
    const r = await fetch('/api/partnerships/documents', { method: 'POST', body: data });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error);
    pendingCommands.current.delete(key);
    setNotice('Private document saved');
  }
  return (
    <div className={styles.root}>
      <header className={styles.heading}>
        <div className={styles.headingCopy}>
          <p className={styles.eyebrow}>Relationships & referrals</p>
          <h1>Partnerships</h1>
          <p className={styles.headingLead}>
            Organizations refer guests. After a deal is accepted, mark the org on the booking
            and keep each conversation moving to a clear next step.
          </p>
        </div>
        <div className={styles.actions}>
          {can('manage_partnerships') && (
            <button className={styles.primary} onClick={() => organizationForm()}>
              + Add organization
            </button>
          )}
        </div>
      </header>
      {error && (
        <FormAlert title="Partnerships" onDismiss={() => setError('')}>
          {error}
        </FormAlert>
      )}
      {notice && (
        <div role="status">
          {notice}
          <button onClick={() => setNotice('')}>Dismiss</button>
        </div>
      )}
      {state?.metrics && (
        <div className={styles.metrics}>
          {[
            ['organizations', 'Organizations'],
            ['historical_interest', 'Historical interest'],
            ['current_interest', 'Current interest'],
            ['active', 'Confirmed active'],
            ['published_contacts', 'Published contact'],
            ['inquiries', 'Inquiry evidence records'],
            ['completed_bookings', 'Linked completed bookings'],
          ].map(([key, title]) => (
            <div key={key}>
              <strong>{state.metrics[key]}</strong>
              <span>{title}</span>
            </div>
          ))}
        </div>
      )}
      <nav className={styles.views} aria-label="Partnership views">
        {views.map(([key, title]) => (
          <button
            key={key}
            aria-pressed={view === key}
            onClick={() => {
              setView(key);
              setOffset(0);
              setSelected(null);
              setDetail(null);
            }}
          >
            {title}
          </button>
        ))}
      </nav>
      {view === 'hotels' && (
        <div className={styles.filters}>
          <input
            aria-label="Search hotel directory"
            placeholder="Search hotel, corp code, IATA, book method…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
          <input
            aria-label="Hotel location filter"
            placeholder="Location / city"
            value={filters.location ?? ''}
            onChange={(e) => {
              setFilters({ ...filters, location: e.target.value });
              setOffset(0);
            }}
          />
        </div>
      )}
      {!['sources', 'outreach', 'hotels'].includes(view) && (
        <div className={styles.filters}>
          <input
            aria-label="Search partners and contacts"
            placeholder="Search organization, person, location, email…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
          {[
            ['stage', 'Stage', options(stages)],
            [
              'campaign',
              'Campaign',
              (state?.campaigns ?? detail?.campaigns ?? []).map((c: R) => ({
                value: c.id,
                label: c.name,
              })),
            ],
            [
              'owner',
              'Owner',
              (state?.owners ?? detail?.owners ?? []).map((o: R) => ({
                value: o.id,
                label: o.name,
              })),
            ],
            ['priority', 'Priority', options(['1', '2', '3', '4', '5'])],
          ].map(([key, title, choices]) => (
            <select
              key={String(key)}
              aria-label={String(title)}
              value={filters[String(key)] ?? ''}
              onChange={(e) => {
                setFilters({ ...filters, [String(key)]: e.target.value });
                setOffset(0);
              }}
            >
              <option value="">
                All {title === 'Priority' ? 'priorities' : String(title).toLowerCase() + 's'}
              </option>
              {(choices as { value: string; label: string }[]).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ))}
          <input
            aria-label="Location filter"
            placeholder="Location"
            value={filters.location ?? ''}
            onChange={(e) => {
              setFilters({ ...filters, location: e.target.value });
              setOffset(0);
            }}
          />
          <label>
            Due by{' '}
            <input
              type="date"
              value={filters.due_before ?? ''}
              onChange={(e) => {
                setFilters({ ...filters, due_before: e.target.value });
                setOffset(0);
              }}
            />
          </label>
        </div>
      )}
      {loading && !state ? (
        <p>Loading partnerships…</p>
      ) : view === 'outreach' ? (
        <div>
          <h2>Review exact messages and recipients</h2>
          <p>
            Approval applies only to the displayed message and recipient. New replies or record
            changes invalidate it.
          </p>
          {state?.drafts?.map((d: R) => (
            <article key={d.id}>
              <button onClick={() => open(d.organization_id)}>{d.organization}</button>
              <p>
                {d.recipient} · {displayStage(d.state)}
              </p>
              <h3>{d.subject}</h3>
              <pre>{d.body}</pre>
              {d.state === 'draft' && can('approve_partnership_outreach') && (
                <button
                  onClick={() =>
                    void action(() =>
                      save(
                        'approve_draft',
                        { id: d.id, version: d.version, approval_hash: d.review_hash },
                        'Staff approved the exact displayed recipient and message',
                      ),
                    )
                  }
                >
                  Approve message for {d.recipient}
                </button>
              )}
            </article>
          ))}
          {(() => {
            const m = offsetMeta(Number(state?.total ?? 0), offset, PAGE);
            return (
              <div className={styles.pager}>
                <ListPager
                  page={m.page}
                  totalPages={m.totalPages}
                  total={m.total}
                  from={m.from}
                  to={m.to}
                  onPage={(p) => setOffset((p - 1) * PAGE)}
                  label="messages"
                />
              </div>
            );
          })()}
        </div>
      ) : view === 'hotels' ? (
        <div>
          <h2>Hotel directory</h2>
          <p>
            Hotels by location with corp code, IATA, commission, and best book method. This catalog
            is separate from per-organization research notes. Search filters the list.
          </p>
          {state && state.enabled === false && (
            <p role="status">{state.note || 'Hotel directory is not installed yet.'}</p>
          )}
          {can('manage_partnerships') && state?.enabled !== false && (
            <button type="button" onClick={() => hotelDirectoryForm()}>
              + Add hotel
            </button>
          )}
          <div className={styles.tableScroll}>
            <table>
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Hotel</th>
                  <th>Organization</th>
                  <th>Corp code</th>
                  <th>IATA</th>
                  <th>Commission</th>
                  <th>Best book</th>
                  <th>Discounts</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const hotelList: R[] = hotels.length ? hotels : ((state?.hotels ?? []) as R[]);
                  const hotelPager = pageSlice(hotelList, Math.floor(offset / PAGE) + 1, PAGE);
                  return hotelPager.items.map((h) => (
                  <tr key={h.id}>
                    <td>{h.location}</td>
                    <td>{h.hotel_name}</td>
                    <td>{label(h.organization_name)}</td>
                    <td>{label(h.corporate_code)}</td>
                    <td>{label(h.iata_code)}</td>
                    <td>
                      {h.hotel_commission ||
                        (h.commission_rate_bps != null
                          ? `${h.commission_rate_bps / 100}%`
                          : 'Not recorded')}
                    </td>
                    <td>{label(h.best_book_method)}</td>
                    <td>{label(h.discounts)}</td>
                    <td>
                      {can('manage_partnerships') && (
                        <button type="button" onClick={() => hotelDirectoryForm(h)}>
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                  ));
                })()}
              </tbody>
            </table>
            {!(hotels.length ? hotels : state?.hotels ?? []).length &&
              state?.enabled !== false && (
                <p className={styles.empty}>
                  No hotels yet. Use + Add hotel for location, corp code, IATA, commission, and best
                  book tips. Booking form can look these up for tips only. Nothing posts money.
                </p>
              )}
          </div>
          {(() => {
            const hotelList: R[] = hotels.length ? hotels : ((state?.hotels ?? []) as R[]);
            const m = offsetMeta(hotelList.length, offset, PAGE);
            return (
              <div className={styles.pager}>
                <ListPager
                  page={m.page}
                  totalPages={m.totalPages}
                  total={m.total}
                  from={m.from}
                  to={m.to}
                  onPage={(p) => setOffset((p - 1) * PAGE)}
                  label="hotels"
                />
              </div>
            );
          })()}
        </div>
      ) : view === 'sources' ? (
        <div>
          <h2>Source coverage</h2>
          <p>Manual refresh only. Imported rows and unresolved matches are reported separately.</p>
          {can('import_partnerships') && (
            <label>
              Import a prepared source bundle
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file)
                    void action(async () => {
                      if (file.size > 64 * 1024 * 1024)
                        throw new Error('Source bundle exceeds 64 MB');
                      const response = await fetch('/api/partnerships/import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: await file.text(),
                      });
                      const result = await response.json();
                      if (!response.ok) throw new Error(result.error);
                      setNotice(
                        `Import reconciled: ${result.source_items ?? result.result?.source_items ?? 0} source items. Review the source register for unresolved records.`,
                      );
                    });
                }}
              />
            </label>
          )}
          <div className={styles.tableScroll}>
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Coverage</th>
                  <th>Status</th>
                  <th>Preserved items</th>
                  <th>Last success / errors</th>
                </tr>
              </thead>
              <tbody>
                {state?.sources?.map((s: R) => (
                  <tr key={s.id}>
                    <td>
                      {s.title}
                      <br />
                      <Source href={s.location} />
                    </td>
                    <td>{s.coverage}</td>
                    <td>{displayStage(s.status)}</td>
                    <td>{s.preserved_items}</td>
                    <td>
                      {label(s.last_success_at)}
                      <p>{s.last_error}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2>Review queue</h2>
          {state?.reviews?.map((r: R) => (
            <article key={r.id}>
              <strong>
                {r.organization ?? 'Unmatched source'} · {displayStage(r.kind)}
              </strong>
              <p>{r.details}</p>
              <Source href={r.source_url} />
              <details>
                <summary>Original record · {r.legacy_id}</summary>
                <pre>{r.original_text}</pre>
              </details>
              <span>{r.status}</span>
              {r.resolution && <p>Latest decision: {r.resolution}</p>}
              {can('manage_partnerships') && r.status !== 'resolved' && (
                <button
                  onClick={() =>
                    setForm({
                      title: 'Record review decision',
                      fields: [
                        f('resolution', 'Evidence and decision', '', 'textarea', true),
                        {
                          ...f('organization_id', 'Match to an organization (optional)'),
                          lookup: 'organizations',
                        },
                        {
                          name: 'status',
                          label: 'Outcome',
                          options: options(['resolved', 'deferred']),
                        },
                      ],
                      onSave: async (d) => {
                        await save('review', {
                          id: r.id,
                          version: r.version,
                          ...d,
                          organization_id: d.organization_id || null,
                        });
                      },
                    })
                  }
                >
                  Review
                </button>
              )}
            </article>
          ))}
          {(() => {
            const m = offsetMeta(Number(state?.total ?? 0), offset, PAGE);
            return (
              <div className={styles.pager}>
                <ListPager
                  page={m.page}
                  totalPages={m.totalPages}
                  total={m.total}
                  from={m.from}
                  to={m.to}
                  onPage={(p) => setOffset((p - 1) * PAGE)}
                  label="reviews"
                />
              </div>
            );
          })()}
        </div>
      ) : (
        <>
          <div className={styles.tableScroll}>
            <table className={styles.queueTable}>
              <thead>
                <tr>
                  <th>Organization / current relationship</th>
                  <th>Opportunity</th>
                  <th>Next action & why</th>
                  <th>Previous discussion</th>
                  <th>Follow-up / owner</th>
                  <th>Outcomes</th>
                </tr>
              </thead>
              <tbody>
                {state?.rows?.map((r: R) => (
                  <tr
                    key={`${r.id}-${r.opportunity_id ?? ''}`}
                    className={r.overdue ? styles.overdue : ''}
                  >
                    <td>
                      <button className={styles.link} onClick={() => open(r.id)}>
                        {r.name}
                      </button>
                      <small>
                        {r.legacy_id} · {r.location}
                      </small>
                      <span className={styles.badge}>
                        {r.relationship === 'active' && !r.confirmation_current
                          ? 'Confirmation expired. Review'
                          : displayStage(r.relationship)}
                      </span>
                      {r.do_not_contact && <strong>Do not contact</strong>}
                    </td>
                    <td>
                      {r.stage === 'active_partner' && !r.confirmation_current
                        ? 'Review agreement'
                        : r.stage
                          ? displayStage(r.stage)
                          : 'No opportunity yet'}
                      <small>{r.campaign}</small>
                      {r.reply_review && (
                        <strong className={styles.warning}>
                          New reply · review before outreach
                        </strong>
                      )}
                    </td>
                    <td>
                      {r.next_action ?? 'Add an owned opportunity'}
                      <small>{r.rationale}</small>
                    </td>
                    <td>
                      <p className={styles.excerpt}>
                        {r.previous_discussion ?? 'No discussion recorded'}
                      </p>
                      <button onClick={() => open(r.id)}>History & draft</button>
                      <details>
                        <summary>Recommended message</summary>
                        <p>{r.suggested_message}</p>
                        <small>
                          Verify the recipient and review the full history before approval.
                        </small>
                      </details>
                    </td>
                    <td>
                      <strong>
                        {r.overdue ? 'Overdue · ' : ''}
                        {r.due_on ?? 'Unscheduled'}
                      </strong>
                      <small>{r.due_on ? '' : r.unscheduled_reason}</small>
                      <small>{r.owner ?? 'No open opportunity'}</small>
                    </td>
                    <td>
                      {r.inquiries} inquiries
                      <br />
                      {r.completed_bookings} completed bookings
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!state?.rows?.length && (
              <p className={styles.empty}>
                No matching opportunities. Add an organization or choose another view.
              </p>
            )}
          </div>
          {(() => {
            const m = offsetMeta(Number(state?.total ?? 0), offset, PAGE);
            return (
              <div className={styles.pager}>
                <ListPager
                  page={m.page}
                  totalPages={m.totalPages}
                  total={m.total}
                  from={m.from}
                  to={m.to}
                  onPage={(p) => setOffset((p - 1) * PAGE)}
                  label="organizations"
                />
              </div>
            );
          })()}
        </>
      )}
      {selected && detail && (
        <section ref={detailSection} className={styles.detail} aria-label="Partner details">
          <header>
            <div>
              <small>
                {org.legacy_id} · {org.location}
              </small>
              <h2>{org.name}</h2>
              <p>{org.summary}</p>
              <span className={styles.badge}>
                {org.relationship === 'active' && !org.confirmation_current
                  ? 'Confirmation expired. Review'
                  : displayStage(org.relationship)}
              </span>
            </div>
            <button
              onClick={() => {
                setSelected(null);
                setDetail(null);
              }}
            >
              Close details
            </button>
          </header>
          <div className={styles.actions}>
            {can('manage_partnerships') && (
              <>
                <button onClick={() => logForm('call')}>Log call</button>
                <button onClick={() => logForm()}>Add note</button>
                <button onClick={() => organizationForm(org)}>Edit organization</button>
                <button onClick={relationshipForm}>Relationship</button>
                <button onClick={() => opportunityForm()}>Add opportunity</button>
              </>
            )}
          </div>
          <div className={styles.opportunities}>
            {detail.opportunities.map((o: R) => (
              <article key={o.id}>
                <small>
                  {o.historical ? 'HISTORICAL CAMPAIGN' : 'CURRENT CAMPAIGN'} · {o.campaign}
                </small>
                <h3>
                  {o.stage === 'active_partner' && !org.confirmation_current
                    ? 'Review agreement'
                    : displayStage(o.stage)}
                </h3>
                <p>{o.next_action}</p>
                <p>{o.rationale}</p>
                <small>
                  {o.owner} · {o.due_on ?? `Unscheduled: ${o.unscheduled_reason}`}
                </small>
                {o.reply_review && (
                  <p className={styles.warning}>
                    A reply needs review. Previous drafts are blocked.
                  </p>
                )}
                {can('manage_partnerships') && (
                  <div className={styles.actions}>
                    <button onClick={() => opportunityForm(o)}>Plan next action</button>
                    {o.reply_review ? (
                      <button onClick={() => opportunityForm(o, true)}>Review reply</button>
                    ) : (
                      !o.historical && (
                        <button onClick={() => void action(() => prepareDraft(o))}>
                          Prepare message
                        </button>
                      )
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
          <nav className={styles.views}>
            {[
              'History',
              'Contacts',
              'Research & hotels',
              'Agreements',
              'Referrals',
              'Drafts',
              'Documents',
              'Sources',
            ].map((t) => (
              <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </nav>
          {tab === 'History' && (
            <div>
              {!detail.timeline.length && <p>No history recorded.</p>}
              {detail.timeline.map((i: R) => (
                <article key={i.id}>
                  <small>
                    {i.occurred_at ?? i.original_date ?? 'Undated'} {i.original_timezone ?? ''} ·{' '}
                    {i.kind} · {i.direction} · {i.campaign ?? 'No campaign assigned'}
                  </small>
                  <h3>{i.subject}</h3>
                  <pre>{i.body}</pre>
                  <Source href={i.source_url} />
                  <small>
                    Imported / recorded {i.created_at} · {i.legacy_id}
                  </small>
                </article>
              ))}
            </div>
          )}
          {tab === 'Contacts' && (
            <div>
              <div className={styles.actions}>
                {can('manage_partnerships') && (
                  <button onClick={() => contactForm()}>Add person</button>
                )}
                {can('manage_partnerships') && (
                  <button onClick={() => methodForm()}>Add contact detail</button>
                )}
              </div>
              {detail.contacts.map((c: R) => (
                <article key={c.id}>
                  <strong>{c.name}</strong>
                  <p>
                    {c.role_title} · {c.preferred_channel} · {c.verification}
                    {c.do_not_contact ? ' · DO NOT CONTACT' : ''}
                  </p>
                  {can('manage_partnerships') && (
                    <button onClick={() => contactForm(c)}>Edit person</button>
                  )}
                </article>
              ))}
              {detail.methods.map((m: R) => (
                <article key={m.id}>
                  <strong>
                    {m.kind}: {m.value}
                  </strong>
                  <p>
                    {m.verification}
                    {m.do_not_contact ? ' · DO NOT CONTACT' : ''}
                  </p>
                  <Source href={m.source_url} />
                  {can('manage_partnerships') && (
                    <button onClick={() => methodForm(m)}>Verify / edit</button>
                  )}
                </article>
              ))}
            </div>
          )}
          {tab === 'Research & hotels' && (
            <div>
              {can('manage_partnerships') && (
                <button onClick={researchForm}>Add sourced finding</button>
              )}
              {detail.research.map((r: R) => (
                <article key={r.id}>
                  <small>
                    {displayStage(r.kind)} · observed {label(r.observed_on)} · verified{' '}
                    {label(r.verified_on)}
                    {r.rank ? ` · rank ${r.rank}` : ''}
                  </small>
                  <h3>{r.title}</h3>
                  <pre>{r.body}</pre>
                  <Source href={r.source_url} />
                </article>
              ))}
            </div>
          )}
          {tab === 'Agreements' && (
            <div>
              {can('manage_partnerships') && (
                <button onClick={agreementForm}>Record agreement / new version</button>
              )}
              <p>
                Terms apply only when explicitly agreed. Recording an agreement creates no
                commission payable.
              </p>
              {detail.agreements.map((a: R) => (
                <article key={a.id}>
                  <h3>
                    Version {a.version} · {a.status}
                  </h3>
                  <p>
                    {label(a.starts_on)} to {label(a.ends_on)} · confirmed{' '}
                    {label(a.confirmed_on)} via {label(a.confirmation_method)}
                  </p>
                  <pre>{a.original_wording}</pre>
                  <p>
                    {a.terms?.calculation === 'fixed'
                      ? money(a.terms.fixed_amount)
                      : a.terms?.rate_bps != null
                        ? `${a.terms.rate_bps / 100}% of ${a.terms.percentage_basis}`
                        : 'Commission terms unconfirmed'}{' '}
                    · {a.terms?.payable_when ?? 'Payment timing unconfirmed'}
                  </p>
                  <Source href={a.evidence_url} />
                </article>
              ))}
            </div>
          )}
          {tab === 'Referrals' && (
            <div>
              <p>Inquiry evidence is separate from bookings and existing accounting obligations.</p>
              <button
                disabled={!can('manage_partnerships')}
                onClick={() =>
                  setForm({
                    title: 'Link referral outcome',
                    fields: [
                      {
                        name: 'kind',
                        label: 'Outcome',
                        options: options(['reported_inquiry', 'verified_inquiry', 'booking']),
                      },
                      f('reference', 'Evidence / reference', '', 'text', true),
                      f('occurred_on', 'Date', '', 'date'),
                      f('source_url', 'Source URL', '', 'url'),
                      {
                        ...f('booking_id', 'Existing Padova booking (search by reference)'),
                        lookup: 'bookings',
                      },
                      {
                        ...f(
                          'accounting_referral_id',
                          'Existing commission payable (search by reference / referrer)',
                        ),
                        lookup: 'referrals',
                      },
                      {
                        name: 'agreement_id',
                        label: 'Agreement version',
                        options: [
                          { value: '', label: 'Unconfirmed' },
                          ...detail.agreements.map((a: R) => ({
                            value: a.id,
                            label: `Version ${a.version}: ${a.status}`,
                          })),
                        ],
                      },
                    ],
                    onSave: async (d) => {
                      await save('referral', {
                        ...d,
                        organization_id: org.id,
                        occurred_on: d.occurred_on || null,
                        source_url: d.source_url || null,
                        booking_id: d.booking_id || null,
                        accounting_referral_id: d.accounting_referral_id || null,
                        agreement_id: d.agreement_id || null,
                      });
                    },
                  })
                }
              >
                Record inquiry / link booking
              </button>
              {detail.referrals.map((r: R) => (
                <article key={r.id}>
                  <h3>
                    {displayStage(r.kind)} · {r.booking_code ?? r.reference}
                  </h3>
                  <p>
                    {r.reference} · {label(r.occurred_on)} ·{' '}
                    {r.reservation_status ?? 'No booking linked'}
                  </p>
                  <Source href={r.source_url} />
                  {r.commission ? (
                    <p>
                      Existing ledger: {money(r.commission.expected_due)} expected ·{' '}
                      {money(r.commission.paid)} paid · {r.commission.hold_reason}
                    </p>
                  ) : (
                    <p>No authorized commission amount shown.</p>
                  )}
                  {r.commission_history?.map((h: R) => (
                    <p key={h.revision}>
                      Terms v{h.revision}: {h.effective_on} · {h.reason}
                    </p>
                  ))}
                </article>
              ))}
            </div>
          )}
          {tab === 'Drafts' && (
            <div>
              <p>Approve the exact recipient and message. No sending service is connected.</p>
              {detail.drafts.map((d: R) => (
                <article key={d.id}>
                  <small>
                    {displayStage(d.state)} · {d.recipient}
                  </small>
                  <h3>{d.subject}</h3>
                  <pre>{d.body}</pre>
                  {d.state === 'draft' && can('approve_partnership_outreach') && (
                    <div className={styles.actions}>
                      <button
                        className={styles.primary}
                        onClick={() =>
                          void action(() =>
                            save(
                              'approve_draft',
                              { id: d.id, version: d.version, approval_hash: d.review_hash },
                              'Staff explicitly approved this exact message and recipient',
                            ),
                          )
                        }
                      >
                        Approve this message for {d.recipient}
                      </button>
                      <button
                        onClick={() =>
                          void action(() => save('reject_draft', { id: d.id, version: d.version }))
                        }
                      >
                        Reject
                      </button>
                    </div>
                  )}
                  {d.state === 'approved' && (
                    <div>
                      <p>
                        Approved for the recipient above. Sending remains manual and requires your
                        explicit action.
                      </p>
                      {can('manage_partnerships') && can('approve_partnership_outreach') && (
                        <button
                          onClick={() =>
                            setForm({
                              title: 'Record message sent elsewhere',
                              description:
                                'Record your completed external send and its evidence. This application sends nothing.',
                              fields: [
                                f('source_url', 'Sent-message evidence URL', '', 'url', true),
                                f(
                                  'occurred_at',
                                  'Sent at (your local time)',
                                  '',
                                  'datetime-local',
                                  true,
                                ),
                                f('next_action', 'Next action', '', 'text', true),
                                f('due_on', 'Follow-up date', '', 'date'),
                                f('unscheduled_reason', 'Reason if unscheduled'),
                              ],
                              onSave: async (values) => {
                                await save(
                                  'manually_sent',
                                  {
                                    id: d.id,
                                    version: d.version,
                                    ...values,
                                    occurred_at: new Date(values.occurred_at).toISOString(),
                                    due_on: values.due_on || null,
                                    unscheduled_reason: values.unscheduled_reason || null,
                                  },
                                  'Staff recorded an externally sent approved message',
                                );
                              },
                            })
                          }
                        >
                          Record sent elsewhere
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
          {tab === 'Documents' && (
            <div>
              <label>
                Add private document (up to 10 MB)
                <input
                  disabled={!can('manage_partnerships')}
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void action(() => upload(file));
                  }}
                />
              </label>
              {detail.documents.map((d: R) => (
                <article key={d.id}>
                  <a href={`/api/partnerships/documents/${d.id}`}>{d.filename}</a>
                  <small>
                    {d.byte_length} bytes · {d.created_at}
                  </small>
                </article>
              ))}
            </div>
          )}
          {tab === 'Sources' && (
            <div>
              {detail.sources.map((s: R) => (
                <article key={s.id}>
                  <h3>
                    {s.source_title} · {s.locator}
                  </h3>
                  <small>
                    {s.legacy_id} · {s.matching_method} · {displayStage(s.outcome)}
                  </small>
                  <p>{s.reason}</p>
                  <Source href={s.source_url} />
                  <details>
                    <summary>Full preserved operational text</summary>
                    <pre>{s.original_text}</pre>
                  </details>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      {form && <EntryForm {...form} onClose={() => setForm(null)} />}
    </div>
  );
}
