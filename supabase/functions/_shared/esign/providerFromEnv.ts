// The only place an EsignProvider is built from env. Secrets: SIGNWELL_API_KEY, SIGNWELL_WEBHOOK_SECRET (edge secrets,
// never portal_settings). SIGNWELL_TEST_MODE defaults to true; set it to "false" to send real (billable) documents.
import type { EsignProvider } from './provider.ts';
import { createSignWellProvider, signWellTestMode } from './signwell.ts';

export type EnvGet = (name: string) => string | undefined;

export function providerFromEnv(name: string, env: EnvGet): EsignProvider | null {
  if (name === 'signwell') {
    return createSignWellProvider({
      apiKey: env('SIGNWELL_API_KEY'),
      webhookSecret: env('SIGNWELL_WEBHOOK_SECRET'),
      testMode: signWellTestMode(env('SIGNWELL_TEST_MODE')),
    });
  }
  return null;
}
