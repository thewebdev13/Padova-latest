import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countRecognizedPasteFields,
  looksLikeStructuredPaste,
  stripClaudeMarkdownFence,
  aiDisclaimerLine,
  resolveAiApiKey,
} from '../src/lib/claude-intake';
import { parseQuickPaste } from '../src/lib/quick-paste';

test('stripClaudeMarkdownFence removes fenced blocks', () => {
  const raw = '```text\nCustomer: Ada\nProduct: Flight\n```';
  assert.equal(stripClaudeMarkdownFence(raw), 'Customer: Ada\nProduct: Flight');
});

test('resolveAiApiKey treats sk-proj as OpenAI', () => {
  const prevO = process.env.OPENAI_API_KEY;
  const prevA = process.env.ANTHROPIC_API_KEY;
  process.env.OPENAI_API_KEY = '';
  process.env.ANTHROPIC_API_KEY = 'sk-proj-test-not-real';
  const resolved = resolveAiApiKey();
  assert.equal(resolved?.provider, 'openai');
  process.env.OPENAI_API_KEY = prevO;
  process.env.ANTHROPIC_API_KEY = prevA;
});

test('looksLikeStructuredPaste counts Field:Value keys', () => {
  const paste = `Customer: Ada Lovelace
Traveler: Ada Lovelace
Product: Flight
Trip Type: Round Trip
Airline: Delta
Route: JFK-ATL
Departure: 2027-02-01
Return: 2027-02-05
Customer Price: Unknown
Notes: test`;
  assert.ok(countRecognizedPasteFields(paste) >= 5);
  assert.equal(looksLikeStructuredPaste(paste), true);
  assert.equal(looksLikeStructuredPaste('hello reservation please book'), false);
});

test('Unknown customer price stays omitted (not zero)', () => {
  const preview = parseQuickPaste(`Customer: Test
Product: Hotel
Departure: 2027-03-01
Return: 2027-03-03
Customer Price: Unknown
Seller Cost: Unknown`);
  assert.equal(preview.fields.sale, undefined);
  assert.equal(preview.fields.seller_cost, undefined);
  assert.match(aiDisclaimerLine('openai'), /OpenAI/);
  assert.match(aiDisclaimerLine('anthropic'), /Claude AI/);
});
