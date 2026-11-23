import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyStaffChatIntent,
  formatStaffChoiceMenu,
  formatStaffGreeting,
  formatStaffGuideReply,
  formatStaffOpeningReply,
  formatStaffOpsBriefing,
  isStaffGreetingText,
  isStaffSmalltalkText,
  polishHumanChat,
} from '../src/lib/wa-staff-chat';

describe('wa-staff-chat', () => {
  it('classifies intents including smalltalk', () => {
    assert.equal(classifyStaffChatIntent('hi'), 'greeting');
    assert.equal(classifyStaffChatIntent('how are you'), 'smalltalk');
    assert.equal(classifyStaffChatIntent("what's up"), 'smalltalk');
    assert.equal(classifyStaffChatIntent('help'), 'menu');
    assert.equal(classifyStaffChatIntent('anything pending?'), 'ops');
    assert.equal(classifyStaffChatIntent('give me a full report'), 'report');
    assert.equal(classifyStaffChatIntent('where are drafts?'), 'guide');
    assert.equal(isStaffGreetingText('hey'), true);
    assert.equal(isStaffSmalltalkText('how are you?'), true);
  });

  it('opens with clean choices, not a sermon dump', () => {
    const first = formatStaffOpeningReply('hi');
    assert.match(first.text, /how can I help you today|What can I help with|What do you need/i);
    assert.match(first.text, /1\) File a reservation/);
    assert.equal(first.showedMenu, true);
    assert.doesNotMatch(first.text, /Say SAVE/);
    assert.doesNotMatch(first.text, /\u2014/);

    const again = formatStaffOpeningReply('hi', {
      helpCount: 2,
      lastHelpAt: Date.now(),
    });
    assert.equal(again.showedMenu, false);
    assert.doesNotMatch(again.text, /1\) File a reservation/);

    const small = formatStaffOpeningReply('how are you', { helpCount: 1, lastHelpAt: Date.now() });
    assert.match(small.text, /good|well/i);
    assert.doesNotMatch(small.text, /Send a reservation file or paste and I will draft it/);
  });

  it('strips AI-looking dashes and phrases', () => {
    const cleaned = polishHumanChat(
      'Hello — I will not invent amounts. Unknown stays Unknown.',
    );
    assert.doesNotMatch(cleaned, /\u2014/);
    assert.doesNotMatch(cleaned, /will not invent/i);
  });

  it('guides with real Padova paths', () => {
    const text = formatStaffGuideReply('where are the drafts');
    assert.match(text, /\/w\/transactions/);
    assert.match(formatStaffChoiceMenu(), /2\) Check pending/);
    assert.match(formatStaffGreeting(), /1\)/);
  });

  it('builds human desk report', () => {
    const report = formatStaffOpsBriefing({
      as_of: '2026-11-20',
      counts: { 'Open draft': 2 },
      items: [{ kind: 'Open draft', title: 'Draft A', urgency: 'open' }],
      full: true,
    });
    assert.match(report, /Desk report/);
    assert.doesNotMatch(report, /\u2014/);
  });
});
