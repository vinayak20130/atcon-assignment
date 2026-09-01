import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizePersonName, normalizePhone } from './identity';

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Rahul.Mehta@Acme.com ')?.key).toBe('rahul.mehta@acme.com');
  });

  it('strips gmail dots and plus tags, and folds googlemail onto gmail', () => {
    const a = normalizeEmail('rahul.mehta+jobs@gmail.com');
    const b = normalizeEmail('rahulmehta@googlemail.com');
    expect(a?.key).toBe('rahulmehta@gmail.com');
    expect(a?.key).toBe(b?.key);
  });

  it('keeps the original spelling for display even when the key is folded', () => {
    expect(normalizeEmail('Rahul.Mehta+jobs@gmail.com')?.display).toBe('rahul.mehta+jobs@gmail.com');
  });

  it('does NOT strip dots on corporate domains', () => {
    // john.smith@ and johnsmith@ at a company may be two different employees.
    expect(normalizeEmail('john.smith@acme.com')?.key).toBe('john.smith@acme.com');
    expect(normalizeEmail('johnsmith@acme.com')?.key).toBe('johnsmith@acme.com');
  });

  it('rejects malformed input', () => {
    for (const bad of ['', '   ', 'nope', 'no@domain', '@acme.com', 'a b@acme.com', '+@gmail.com']) {
      expect(normalizeEmail(bad), bad).toBeNull();
    }
  });
});

describe('normalizePhone', () => {
  it('canonicalizes formatting variants to a single key', () => {
    const keys = new Set(
      ['+91 98765 43210', '+919876543210', '+91-98765-43210'].map((v) => normalizePhone(v)?.key),
    );
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe('+919876543210');
  });

  it('uses the default country for bare national numbers', () => {
    expect(normalizePhone('9876543210', 'IN')?.key).toBe('+919876543210');
    expect(normalizePhone('9876543210')).toBeNull();
  });

  it('rejects junk', () => {
    for (const bad of ['', '12', 'not a phone', '000']) {
      expect(normalizePhone(bad, 'IN'), bad).toBeNull();
    }
  });
});

describe('normalizePersonName', () => {
  it('normalizes case, accents and spacing', () => {
    expect(normalizePersonName('  Rahúl   MEHTA ')).toBe('rahul mehta');
  });

  it('does not reorder words', () => {
    // Asserting these are the same person is a guess. A fuzzy scorer handles it
    // more safely than a normalizer that hard-codes it.
    expect(normalizePersonName('Kumar Rahul')).not.toBe(normalizePersonName('Rahul Kumar'));
  });
});
