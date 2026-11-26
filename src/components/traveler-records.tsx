'use client';
import ChoiceInput from './choice-input';
import {
  LOYALTY_PROGRAM_OTHER,
  mergeLoyaltyProgramOptions,
} from '@/lib/entry-options';
type R = Record<string, any>;
export default function TravelerRecords({
  memberships,
  documents,
  onMemberships,
  onDocuments,
  programExtras = [],
}: {
  memberships: R[];
  documents: R[];
  onMemberships: (rows: R[]) => void;
  onDocuments: (rows: R[]) => void;
  /** Extra program names already in use (programs table / asset issuers). */
  programExtras?: Array<string | null | undefined>;
}) {
  const edit = (rows: R[], index: number, key: string, value: string) =>
    rows.map((r, i) => (i === index ? { ...r, [key]: value } : r));
  const programOptions = mergeLoyaltyProgramOptions(programExtras);
  return (
    <>
      {memberships.length > 0 && (
        <fieldset>
          <legend>Saved loyalty memberships</legend>
          {memberships.map((row, index) => (
            <div className="form-grid" key={index}>
              <div className="form-field">
                <label htmlFor={`member-${index}-program`}>Program *</label>
                <ChoiceInput
                  id={`member-${index}-program`}
                  label={`Membership ${index + 1} program`}
                  required
                  options={programOptions}
                  value={row.program ?? ''}
                  onChange={(v) => onMemberships(edit(memberships, index, 'program', v))}
                />
              </div>
              {(row.program === LOYALTY_PROGRAM_OTHER || row.program === 'Other') && (
                <div className="form-field">
                  <label htmlFor={`member-${index}-program-custom`}>New program name *</label>
                  <input
                    id={`member-${index}-program-custom`}
                    required
                    value={row.program_custom ?? ''}
                    onChange={(e) =>
                      onMemberships(edit(memberships, index, 'program_custom', e.target.value))
                    }
                  />
                </div>
              )}
              <button
                type="button"
                className="btn small"
                onClick={() => onMemberships(memberships.filter((_, i) => i !== index))}
              >
                Remove membership {index + 1}
              </button>
              <div className="form-field">
                <label htmlFor={`member-${index}-number`}>Member number *</label>
                <input
                  id={`member-${index}-number`}
                  required
                  value={row.number ?? ''}
                  onChange={(e) =>
                    onMemberships(edit(memberships, index, 'number', e.target.value))
                  }
                />
              </div>
            </div>
          ))}
        </fieldset>
      )}
      <div className="traveler-record-actions">
        <button
          type="button"
          className="btn"
          onClick={() => onMemberships([...memberships, { program: '', number: '' }])}
        >
          + Add loyalty membership
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => onDocuments([...documents, { type: 'passport', number: '', country: '' }])}
        >
          + Add travel document
        </button>
      </div>
      {documents.length > 0 && (
        <fieldset>
          <legend>Saved protected travel documents</legend>
          {documents.map((row, index) => (
            <div className="form-grid" key={index}>
              <div className="form-field">
                <label htmlFor={`doc-${index}-type`}>Document type *</label>
                <ChoiceInput
                  id={`doc-${index}-type`}
                  label={`Document ${index + 1} type`}
                  required
                  options={['passport', 'national ID', 'visa']}
                  value={row.type ?? ''}
                  onChange={(v) => onDocuments(edit(documents, index, 'type', v))}
                />
              </div>
              <div className="form-field">
                <label htmlFor={`doc-${index}-number`}>Document number *</label>
                <input
                  id={`doc-${index}-number`}
                  required
                  value={row.number ?? ''}
                  onChange={(e) => onDocuments(edit(documents, index, 'number', e.target.value))}
                />
              </div>
              <div className="form-field">
                <label htmlFor={`doc-${index}-country`}>Issuing country *</label>
                <ChoiceInput
                  id={`doc-${index}-country`}
                  label={`Document ${index + 1} country`}
                  required
                  options={[
                    'United States',
                    'Israel',
                    'United Kingdom',
                    'Canada',
                    'France',
                    'Germany',
                    'Australia',
                    'South Africa',
                  ]}
                  value={row.country ?? ''}
                  onChange={(v) => onDocuments(edit(documents, index, 'country', v))}
                />
              </div>
              <div className="form-field">
                <label htmlFor={`doc-${index}-expiry`}>Expires on</label>
                <input
                  id={`doc-${index}-expiry`}
                  type="date"
                  value={row.expires_on ?? ''}
                  onChange={(e) =>
                    onDocuments(edit(documents, index, 'expires_on', e.target.value))
                  }
                />
              </div>
              <button
                type="button"
                className="btn small"
                onClick={() => onDocuments(documents.filter((_, i) => i !== index))}
              >
                Remove document {index + 1}
              </button>
            </div>
          ))}
        </fieldset>
      )}
    </>
  );
}
