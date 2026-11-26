import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatRefundCallNoteBody,
  isRefundCallNoteBody,
  latestRefundCallNoteText,
  parseRefundCallNotes,
  refundCallNoteAttentionDetail,
  stripRefundCallNotePrefix,
} from '../src/lib/refund-call-notes';

test('call note body is prefixed once; blank stays blank', () => {
  assert.equal(formatRefundCallNoteBody('Called airline — ticket pending'), 'Call note: Called airline — ticket pending');
  assert.equal(
    formatRefundCallNoteBody('Call note: Already prefixed'),
    'Call note: Already prefixed',
  );
  assert.equal(formatRefundCallNoteBody('  '), '');
  assert.equal(isRefundCallNoteBody('Call note: hi'), true);
  assert.equal(isRefundCallNoteBody('Cancellation reason'), false);
  assert.equal(stripRefundCallNotePrefix('Call note:  left voicemail'), 'left voicemail');
});

test('parseRefundCallNotes keeps only call notes; latest text for follow-up', () => {
  const notes = [
    { id: '1', body: 'Cancellation filed', record_type: 'refund' },
    { id: '2', body: 'Call note: Left VM', record_type: 'refund', created_at: '2026-11-01' },
    { id: '3', body: 'Call note: Spoke with agent', record_type: 'refund', created_at: '2026-11-02' },
  ];
  const parsed = parseRefundCallNotes(notes);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1].text, 'Spoke with agent');
  assert.equal(latestRefundCallNoteText(notes), 'Spoke with agent');
  assert.equal(latestRefundCallNoteText([]), null);
});

test('attention detail includes latest call without inventing amounts', () => {
  assert.match(
    refundCallNoteAttentionDetail('Customer cancelled', 'Left VM with airline'),
    /Latest call: Left VM/,
  );
  assert.equal(
    refundCallNoteAttentionDetail('', ''),
    'Chase refund until settled',
  );
});
