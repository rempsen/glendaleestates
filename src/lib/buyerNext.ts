// Where /buyer-auth sends a buyer after sign-in. Allow-listed paths only (no open redirect); default is the wizard.
import { MY_QUOTE_PATH } from '@shared/buyerContact';

export const BUYER_DEFAULT_PATH = '/select';
const ALLOWED_NEXT: readonly string[] = [BUYER_DEFAULT_PATH, MY_QUOTE_PATH];

export function safeBuyerNext(next: string | null | undefined): string {
  return next && ALLOWED_NEXT.includes(next) ? next : BUYER_DEFAULT_PATH;
}

export function buyerAuthPath(next: string): string {
  return `/buyer-auth?mode=signin&next=${encodeURIComponent(safeBuyerNext(next))}`;
}
