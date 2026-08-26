import { describe, expect, it } from 'vitest';
import { embeddedPerson, normaliseHandle, validateHandle } from './people.ts';

/**
 * The handle rules live in a database check constraint. These tests exist so the
 * client rejects the same things for the same reasons, in language a person can act
 * on — a bare constraint violation tells someone nothing about what to type instead.
 */

describe('normalising a handle', () => {
  it('drops a leading @, which is how people write handles', () => {
    expect(normaliseHandle('@ana')).toBe('ana');
  });

  it('lower-cases, since the constraint only permits lower case', () => {
    expect(normaliseHandle('AnaRuiz')).toBe('anaruiz');
  });

  it('turns spaces, dots and dashes into underscores rather than rejecting them', () => {
    // Bouncing "Ana Ruiz" off a regex nobody can see is worse than fixing it.
    expect(normaliseHandle('Ana Ruiz')).toBe('ana_ruiz');
    expect(normaliseHandle('ana.ruiz')).toBe('ana_ruiz');
    expect(normaliseHandle('ana-ruiz')).toBe('ana_ruiz');
  });

  it('collapses a run of separators instead of leaving a gap', () => {
    expect(normaliseHandle('ana   ruiz')).toBe('ana_ruiz');
  });

  it('trims pasted whitespace', () => {
    expect(normaliseHandle('  ana  ')).toBe('ana');
  });
});

describe('validating a handle', () => {
  it('accepts what the constraint accepts', () => {
    expect(validateHandle('ana_ruiz_2')).toBeUndefined();
    expect(validateHandle('ab')).toBeUndefined();
    expect(validateHandle('a'.repeat(30))).toBeUndefined();
  });

  it('validates what will actually be stored, not what was typed', () => {
    // Normalisation runs first, so this is accepted and saved as ana_ruiz.
    expect(validateHandle('@Ana Ruiz')).toBeUndefined();
  });

  it('rejects one that is too short', () => {
    expect(validateHandle('a')).toMatch(/two characters/);
    expect(validateHandle('')).toMatch(/two characters/);
  });

  it('rejects one that is too long', () => {
    expect(validateHandle('a'.repeat(31))).toMatch(/30 characters/);
  });

  it('rejects characters the database would refuse', () => {
    expect(validateHandle('ana!')).toMatch(/letters, numbers and underscores/);
    expect(validateHandle('añá')).toMatch(/letters, numbers and underscores/);
  });

  it('explains the problem rather than just saying no', () => {
    // Every rejection is a sentence someone can act on.
    for (const bad of ['a', 'a'.repeat(31), 'ana!']) {
      expect(validateHandle(bad)).toMatch(/\.$/);
    }
  });
});

describe('unwrapping an embedded profile', () => {
  const row = { id: 'u1', handle: 'ana', display_name: 'Ana Ruiz' };

  it('reads a to-one embed returned as an object', () => {
    expect(embeddedPerson(row)).toEqual({ id: 'u1', handle: 'ana', displayName: 'Ana Ruiz' });
  });

  it('reads the same embed returned as a one-element array', () => {
    // PostgREST returns an object, but without generated types the client infers an
    // array. Guessing wrong silently empties a whole list, so accept both.
    expect(embeddedPerson([row])?.handle).toBe('ana');
  });

  it('treats a missing display name as absent rather than empty', () => {
    expect(embeddedPerson({ id: 'u1', handle: 'ana', display_name: null })?.displayName)
      .toBeUndefined();
  });

  it('drops anything that is not a profile', () => {
    expect(embeddedPerson(null)).toBeUndefined();
    expect(embeddedPerson([])).toBeUndefined();
    expect(embeddedPerson({})).toBeUndefined();
    expect(embeddedPerson('ana')).toBeUndefined();
  });
});
