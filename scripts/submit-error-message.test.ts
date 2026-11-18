import { test, expect } from 'bun:test';
import { submitErrorMessage, SUBMIT_SAVE_FAILED, SUBMIT_POST_SAVE_FAILED, SUBMIT_UNKNOWN_500 } from '../src/lib/submitErrorMessage';

test('500 messages depend on the error code', () => {
  expect(submitErrorMessage(500, 'save_failed')).toBe(SUBMIT_SAVE_FAILED);
  expect(submitErrorMessage(500, 'post_save_failed')).toBe(SUBMIT_POST_SAVE_FAILED);
  expect(submitErrorMessage(500, 'internal_error')).toBe(SUBMIT_UNKNOWN_500);
  expect(submitErrorMessage(500)).toBe(SUBMIT_UNKNOWN_500);
  expect(SUBMIT_POST_SAVE_FAILED).toContain('do not submit again');
  expect(SUBMIT_UNKNOWN_500).toContain('do not submit again');
  expect(SUBMIT_SAVE_FAILED).not.toContain('do not submit again');
});

test('401 and 403 keep their messages', () => {
  expect(submitErrorMessage(401)).toContain('session has expired');
  expect(submitErrorMessage(403)).toContain('must match the email');
});
