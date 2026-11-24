import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assistantAskQuestions,
  formatAssistantHelpMenu,
  formatAssistantOpsBriefing,
  formatAssistantProposal,
  isAssistantFollowUpText,
  isAssistantFreeChat,
  isAssistantGreetingText,
  isAssistantGuideQuestion,
  isAssistantOpsQuestion,
  isWaAssistantPhone,
  isWaAssistantRequest,
  mergeAssistantFields,
  parseAssistantStaffReply,
  stampAssistantDraftEntry,
} from '../src/lib/wa-assistant';
import { formatStaffFactReply } from '../src/lib/wa-staff-chat';

describe('wa-assistant staff Q&A', () => {
  it('parses SAVE / CANCEL / labeled and plain fields', () => {
    assert.equal(parseAssistantStaffReply('SAVE').kind, 'save');
    assert.equal(parseAssistantStaffReply('yes').kind, 'save');
    assert.equal(parseAssistantStaffReply('cancel').kind, 'cancel');
    const fields = parseAssistantStaffReply(
      'Customer: Miriam Cohen\nProduct: Hotel\nSale: 410.00\nTravel start: 2027-03-01',
    );
    assert.equal(fields.kind, 'fields');
    assert.equal(fields.fields.intake_customer_label, 'Miriam Cohen');
    const plain = parseAssistantStaffReply('Customer Miriam Cohen\nSale 410');
    assert.equal(plain.kind, 'fields');
    assert.equal(plain.fields.sale, '410');
  });

  it('asks for missing facts without inventing', () => {
    const q = assistantAskQuestions({ product: 'Hotel' });
    assert.ok(q.some((line) => /Customer name/i.test(line)));
  });

  it('merges answers and stamps AI assistant transcript', () => {
    const stamped = stampAssistantDraftEntry(
      { product: 'Hotel', sale: '' },
      { from_number: '+1 (555) 010-9999', raw_text: 'Hotel confirmation…', message_id: 'm1' },
    );
    assert.equal(stamped.ai_created, true);
    const merged = mergeAssistantFields(
      stamped,
      { intake_customer_label: 'Miriam Cohen', sale: '410' },
      'Customer Miriam\nSale 410',
    );
    assert.equal(merged.sale, '410');
  });

  it('formats proposal in plain human tone', () => {
    const text = formatAssistantProposal({
      draft_id: 'd1',
      title: 'Hotel draft',
      entry: { product: 'Hotel', travel_start: '2027-03-01', sale: 'Unknown' },
    });
    assert.match(text, /Got it/);
    assert.match(text, /SAVE/);
    assert.doesNotMatch(text, /\u2014/);
    assert.doesNotMatch(text, /won'?t invent/i);
  });

  it('detects advanced staff intents', () => {
    assert.equal(isAssistantGreetingText('hi'), true);
    assert.equal(isAssistantOpsQuestion('anything pending?'), true);
    assert.equal(isAssistantOpsQuestion('give me a full report'), true);
    assert.equal(isAssistantOpsQuestion('is booking created?'), true);
    assert.equal(isAssistantOpsQuestion('did you create the booking'), true);
    assert.equal(isAssistantGuideQuestion('where are drafts?'), true);
    assert.equal(isAssistantFreeChat('can you walk me through a new booking?'), true);
    assert.equal(isAssistantFollowUpText('SAVE'), true);
    process.env.PADOVA_WA_ASSISTANT_PHONES = '15550109999';
    assert.equal(isWaAssistantPhone('+1 555-010-9999'), true);
    assert.equal(isWaAssistantRequest('+1 555-010-9999', { assistant: true }), true);
    // assistant=true alone must NOT unlock non-allowlisted numbers (loop fix).
    assert.equal(isWaAssistantRequest('+63 947 429 8020', { assistant: true }), false);
    assert.equal(isWaAssistantRequest('639474298020', { assistant: true }), false);
  });

  it('greets and briefs without AI-looking copy', () => {
    const menu = formatAssistantHelpMenu();
    assert.match(menu, /Hey/);
    assert.doesNotMatch(menu, /AI stamp/);
    assert.doesNotMatch(menu, /\u2014/);

    const busy = formatAssistantOpsBriefing({
      as_of: '2026-11-20',
      counts: { 'Open draft': 2 },
      items: [{ kind: 'Open draft', title: 'Draft A', urgency: 'open' }],
    });
    assert.match(busy, /desk/i);
    assert.doesNotMatch(busy, /\u2014/);
  });

  it('answers booking-created from draft facts', () => {
    const withDraft = formatStaffFactReply({
      question: 'is booking created?',
      as_of: '2026-11-23',
      counts: { 'Open draft': 1 },
      items: [{ kind: 'Open draft', title: 'St Regis', urgency: 'open' }],
      openDraft: { id: 'd1', title: 'St Regis Rome' },
    });
    assert.match(withDraft, /Not a live booking/i);
    assert.match(withDraft, /St Regis Rome/);
    assert.doesNotMatch(withDraft, /I can help with/i);

    const noDraft = formatStaffFactReply({
      question: 'is booking created?',
      as_of: '2026-11-23',
      counts: {},
      items: [],
      openDraft: null,
    });
    assert.match(noDraft, /do not see an open draft/i);
  });
});
