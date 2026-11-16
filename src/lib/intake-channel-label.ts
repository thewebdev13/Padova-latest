/** Staff-facing labels for booking_draft intake_provenance.source. */

export type IntakeChannelSource =
  | 'staff_upload'
  | 'staff_paste'
  | 'email'
  | 'whatsapp'
  | string
  | null
  | undefined;

export function intakeChannelBadge(source: IntakeChannelSource): string {
  switch (source) {
    case 'email':
      return 'Email intake';
    case 'whatsapp':
      return 'WhatsApp intake';
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
