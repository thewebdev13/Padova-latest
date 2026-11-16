'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import CommandForm from './command-form';

type R = Record<string, any>;
/** Protected details are fetched only on demand, never copied into booking recovery/paste. */
export default function BookingTravelerDetails({
  personId,
  state,
  onClose,
  onCommand,
  onPersonSaved,
}: {
  personId: string;
  state: R;
  onClose: () => void;
  onCommand: (kind: string, data: R, key: string) => Promise<R>;
  onPersonSaved: (person: R) => void;
}) {
  const [record, setRecord] = useState<R | null>(null);
  const [contact, setContact] = useState<R>({});
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const contactKey = useRef({ signature: '', key: '' });
  const profileKey = useRef({ signature: '', key: '' });
  const [contactBusy, setContactBusy] = useState(false);
  const savedContact = useRef<R | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    setError('');
    fetch(`/api/state?type=person&id=${encodeURIComponent(personId)}`, {
      signal: abort.signal,
      cache: 'no-store',
    })
      .then(async (r) => {
        if (!r.ok) throw Error('Unable to load traveler details. Retry before editing.');
        return r.json();
      })
      .then((r) => {
        if (r.person?.id !== personId || r.person.kind !== 'person')
          throw Error('Traveler record could not be verified.');
        setRecord(r);
        setContact({
          name: r.person.name,
          email: r.person.email ?? '',
          phone: r.person.phone ?? '',
          whatsapp: r.person.details?.whatsapp ?? '',
        });
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [personId, attempt]);
  if (!record)
    return (
      <div className="modal-backdrop">
        <div className="modal" role="dialog" aria-modal="true" aria-label="Traveler details">
          <div className="modal-head">
            <h2>Traveler details</h2>
            <button type="button" onClick={onClose}>
              Back to booking
            </button>
          </div>
          <div className="modal-body">
            {error ? (
              <>
                <p role="alert">{error}</p>
                <button type="button" className="btn" onClick={() => setAttempt(attempt + 1)}>
                  Retry
                </button>
              </>
            ) : (
              <p role="status">Loading saved traveler details…</p>
            )}
          </div>
        </div>
      </div>
    );
  const canPrivate =
    state.actor.role === 'OWNER' || state.actor.permissions.includes('view_traveler_sensitive');
  const person = record.person;
  const commandKey = (ref: { current: { signature: string; key: string } }, data: R) => {
    const signature = JSON.stringify(data);
    if (ref.current.signature !== signature) ref.current = { signature, key: crypto.randomUUID() };
    return ref.current.key;
  };
  const saveContact = async () => {
    const original = {
      name: person.name,
      email: person.email ?? '',
      phone: person.phone ?? '',
      whatsapp: person.details?.whatsapp ?? '',
    };
    if (JSON.stringify(contact) === JSON.stringify(savedContact.current ?? original)) return;
    const updated = {
      ...person,
      ...contact,
      details: { ...person.details, whatsapp: contact.whatsapp },
    };
    const payload = {
      party_id: personId,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      roles: person.roles,
      details: updated.details,
      reason: 'Update traveler contact details from booking',
    };
    await onCommand('edit_party', payload, commandKey(contactKey, payload));
    savedContact.current = { ...contact };
    onPersonSaved(updated);
  };
  const fields: ReactNode = (
    <fieldset className="traveler-contact-fields form-grid">
      <legend>Contact details · saved for future bookings</legend>
      {[
        ['name', 'Display name'],
        ['email', 'Email (optional)'],
        ['phone', 'Phone (optional)'],
        ['whatsapp', 'WhatsApp (optional)'],
      ].map(([key, label]) => (
        <div className="form-field" key={key}>
          <label htmlFor={`traveler-contact-${key}`}>{label}</label>
          <input
            id={`traveler-contact-${key}`}
            type={
              key === 'email' ? 'email' : key === 'phone' || key === 'whatsapp' ? 'tel' : 'text'
            }
            required={key === 'name'}
            value={contact[key] ?? ''}
            onChange={(e) => setContact((old) => ({ ...old, [key]: e.target.value }))}
          />
        </div>
      ))}
      <button
        type="button"
        className="btn"
        disabled={contactBusy}
        onClick={async (e) => {
          const inputs = e.currentTarget.closest('fieldset')?.querySelectorAll('input');
          if (inputs && [...inputs].some((input) => !input.reportValidity())) return;
          setContactBusy(true);
          setError('');
          try {
            await saveContact();
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to save contact details');
          } finally {
            setContactBusy(false);
          }
        }}
      >
        {contactBusy ? 'Saving…' : 'Save contact only & return'}
      </button>
      <small className="full">
        Travel details below are optional. Legal names are required only when you save travel
        details.
      </small>
      {error && (
        <p role="alert" className="full">
          {error}
        </p>
      )}
    </fieldset>
  );
  return (
    <CommandForm
      config={{
        kind: canPrivate ? 'traveler' : 'edit_party',
        title: `Traveler details · ${person.name}`,
        description:
          'Saved on this traveler’s profile for future bookings. Your booking stays open.',
        submit_label: 'Save traveler details',
        defaults: canPrivate
          ? {
              ...record.privateData,
              person_id: personId,
              seat: record.privateData?.preferences?.seat ?? '',
            }
          : {
              ...person,
              party_id: personId,
              reason: 'Update traveler contact details from booking',
            },
        contact_only: !canPrivate,
      }}
      extraFields={
        canPrivate ? (
          fields
        ) : (
          <p className="note">
            Contact information can be updated here. Protected travel documents require
            traveler-details access.
          </p>
        )
      }
      state={state}
      onClose={onClose}
      onSubmit={async (data) => {
        if (!canPrivate) {
          const payload = {
            ...data,
            party_id: personId,
            roles: person.roles,
            details: {
              ...person.details,
              whatsapp: data.details?.whatsapp ?? person.details?.whatsapp,
            },
            reason: 'Update traveler contact details from booking',
          };
          await onCommand('edit_party', payload, commandKey(contactKey, payload));
          onPersonSaved({ ...person, ...data, details: payload.details });
          onClose();
          return;
        }
        await saveContact();
        const payload = { ...data, person_id: personId };
        try {
          await onCommand('traveler', payload, commandKey(profileKey, payload));
        } catch (e) {
          throw new Error(
            `${savedContact.current ? 'Contact details were saved. ' : ''}Travel details were not saved: ${e instanceof Error ? e.message : 'Retry this save.'}`,
          );
        }
        onClose();
      }}
    />
  );
}
