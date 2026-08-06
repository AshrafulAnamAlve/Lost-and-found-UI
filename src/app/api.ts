import { environment } from '../environments/environment';

// Single source of truth for the backend origin.
//
// Production builds point at the deployed API (environment.prod.ts). In
// development the origin is derived from how the page was opened, so the app
// works on localhost AND from another device on the same network: opening
// https://192.168.0.103:4200 sends API/SignalR calls to https://192.168.0.103:7124.
export const API_ORIGIN = environment.apiOrigin || `https://${location.hostname}:7124`;

/** Items, users, matching. */
export const API_BASE = `${API_ORIGIN}/api/LostAndFound`;
/** Chat REST endpoints. */
export const MESSAGES_API = `${API_ORIGIN}/api/Messages`;
/** SignalR chat/call hub. */
export const CHAT_HUB = `${API_ORIGIN}/chatHub`;

/** Turns a stored imageUrl ("/uploads/lost/x.jpg") into an absolute URL. */
export function resolveImageUrl(raw: string | null | undefined): string {
  if (!raw) return '';
  if (raw.startsWith('http') || raw.startsWith('data:')) return raw;
  return `${API_ORIGIN}${raw}`;
}
