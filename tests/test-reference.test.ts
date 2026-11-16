import assert from 'node:assert/strict';
import test from 'node:test';
import {
  referenceKey,
  singleTravelerLabel,
  sourceName,
  confirmedCustomerGroups,
  directoryContextLabel,
} from '../src/lib/test-reference';

test('all approved group aliases resolve across source rows; payment context stays out of name matching', () => {
  const aliases = [
    {
      id: 'alias-row',
      evidence_class: 'owner_confirmed_name_group_with_source_row',
      raw: {
        original_row: 12,
        original_label: 'demo alpha change',
        current_label: 'Demo Alpha',
        owner_decision_ids: ['GROUP-A'],
      },
    },
  ];
  const decisions = [
    {
      id: 'decision-a',
      evidence_class: 'owner_confirmed_answer',
      raw: {
        decision_id: 'GROUP-A',
        question:
          'Should “demo a” and “demo alpha change” use “Demo Alpha”? Keeping “change” in notes.',
        answer: 'Combine all as Demo Alpha',
      },
    },
    {
      id: 'decision-b',
      evidence_class: 'owner_confirmed_answer',
      raw: {
        decision_id: 'GROUP-B',
        question:
          'Should “demo b” and “demo b alpha paid” use “Demo Beta”, keeping “alpha paid” in notes?',
        answer: 'Combine as Demo Beta',
      },
    },
  ];
  const groups = confirmedCustomerGroups(aliases, decisions);
  assert.equal(groups.resolve('DEMO A')?.name, 'Demo Alpha');
  assert.equal(groups.resolve('demo alpha change')?.name, 'Demo Alpha');
  assert.equal(groups.resolve('demo b alpha paid')?.name, 'Demo Beta');
  assert.equal(groups.resolve('alpha paid'), undefined);
  assert.equal(directoryContextLabel('demo b alpha paid'), true);
  assert.equal(directoryContextLabel('Demo Beta'), false);
  assert.equal(groups.declarations, 2);
});
test('keep-separate instructions and conflicting group targets cannot become identity merges', () => {
  const groups = confirmedCustomerGroups(
    [
      {
        id: 'one',
        evidence_class: 'owner_confirmed_name_group',
        raw: { original_label: 'ambiguous', current_label: 'Demo One' },
      },
      {
        id: 'two',
        evidence_class: 'owner_confirmed_name_group',
        raw: { original_label: 'ambiguous', current_label: 'Demo Two' },
      },
      {
        id: 'blocked',
        evidence_class: 'owner_confirmed_name_group',
        raw: { original_label: 'Demo Other', current_label: 'Demo One' },
      },
    ],
    [
      {
        id: 'separate',
        evidence_class: 'owner_confirmed_answer',
        raw: { question: 'Are “Demo Other” and “Demo One” the same?', answer: 'Keep separate' },
      },
    ],
  );
  assert.equal(groups.resolve('ambiguous'), undefined);
  assert.equal(groups.resolve('Demo Other'), undefined);
  assert.deepEqual(groups.conflicts, ['ambiguous']);
});
test('reference deduplication handles exact case/spacing variants without fuzzy identity merging', () => {
  assert.equal(referenceKey('  Demo   Traveler '), referenceKey('demo traveler'));
  assert.notEqual(referenceKey('Demo Traveler'), referenceKey('Traveler Demo'));
});
test('ambiguous passenger groups and descriptive labels are never split into guessed people', () => {
  assert.ok(singleTravelerLabel('Demo Alex Morgan'));
  assert.ok(singleTravelerLabel('DEMO TRAVELER'));
  for (const value of [
    'LAST, First',
    'A Person, Another Person',
    'padawer fam',
    'child passenger',
    '123456',
    'John / Mary',
  ])
    assert.equal(singleTravelerLabel(value), false);
});
test('rate-source lookup drops URL query/login material and preserves provider host names', () => {
  assert.equal(sourceName('https://www.example.com/path?private=value'), 'example.com');
  assert.equal(sourceName('Sruli Travel'), 'Sruli Travel');
});
