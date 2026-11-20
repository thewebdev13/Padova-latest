/** Staff-facing labels for booking_draft intake_provenance.source. */

export type IntakeChannelSource =
  | 'staff_upload'
  | 'staff_paste'
  | 'email'
  | 'whatsapp'
  | 'instinct'
  | string
  | null
  | undefined;

/** Short table tag for live bookings on Transactions. */
export function intakeSourceTableTag(source: IntakeChannelSource): {
  label: string;
  tone: string;
} {
  switch (source) {
    case 'email':
      return { label: 'Email', tone: 'blue' };
    case 'whatsapp':
      return { label: 'WhatsApp', tone: 'green' };
    case 'staff_upload':
      return { label: 'File', tone: 'gray' };
    case 'staff_paste':
      return { label: 'Paste', tone: 'gray' };
    case 'instinct':
      return { label: 'Intake', tone: 'gray' };
    default:
      return { label: 'Manual', tone: 'gray' };
  }
}

export function intakeChannelBadge(source: IntakeChannelSource): string {
  switch (source) {
    case 'email':
      return 'Email intake';
    case 'whatsapp':
      return 'WhatsApp intake';
    case 'instinct':
      // Unused path (PC helper only) — do not show product name in staff UI
      return 'Intake';
    case 'staff_upload':
      return 'File intake';
    case 'staff_paste':
      return 'Paste intake';
    default:
      return source ? 'Intake' : 'Draft';
  }
}

export function intakeChannelFilterKey(source: IntakeChannelSource): string {
  switch (source) {
    case 'email':
      return 'email';
    case 'whatsapp':
      return 'whatsapp';
    case 'instinct':
      return 'instinct';
    case 'staff_upload':
    case 'staff_paste':
      return 'staff';
    default:
      return source ? 'intake' : 'manual';
  }
}

export function formatIntakeProvenanceLine(p: {
  source?: IntakeChannelSource;
  from_address?: string | null;
  subject?: string | null;
  mailbox?: string | null;
  filename?: string | null;
}): string {
  const parts = [
    intakeChannelBadge(p.source),
    p.mailbox ? `→ ${p.mailbox}` : null,
    p.from_address ? `from ${p.from_address}` : null,
    p.subject ? `“${p.subject}”` : null,
    p.filename ? p.filename : null,
  ].filter(Boolean);
  return parts.join(' · ');
}
