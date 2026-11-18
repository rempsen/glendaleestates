import { test, expect } from 'bun:test';
import { addRecipient, removeRecipient, isValidEmail, parseStoredRecipients } from '../src/lib/notificationRecipients';

test('isValidEmail', () => {
  expect(isValidEmail(' a@b.co ')).toBe(true);
  expect(isValidEmail('a@b')).toBe(false);
  expect(isValidEmail('a b@c.co')).toBe(false);
});
test('addRecipient trims, rejects invalid and duplicates (case-insensitive)', () => {
  expect(addRecipient(['a@b.co'], ' c@d.org ')).toEqual({ list: ['a@b.co', 'c@d.org'] });
  expect(addRecipient(['a@b.co'], 'nope')).toEqual({ error: 'Enter a valid email address.' });
  expect(addRecipient(['a@b.co'], 'A@B.CO')).toEqual({ error: 'That address is already on the list.' });
});
test('removeRecipient', () => {
  expect(removeRecipient(['a@b.co', 'c@d.org'], 'a@b.co')).toEqual(['c@d.org']);
});
test('parseStoredRecipients', () => {
  expect(parseStoredRecipients(['a@b.co'])).toEqual(['a@b.co']);
  expect(parseStoredRecipients('x')).toBeNull();
  expect(parseStoredRecipients([1])).toBeNull();
});
