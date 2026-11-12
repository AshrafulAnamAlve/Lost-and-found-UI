/**
 * The signed-in user, as stored in this browser.
 *
 * `token` is what the API actually trusts - it is signed by the server and sent
 * with every request (see auth.interceptor.ts). `userid` and `username` are kept
 * alongside for display. Sessions saved before tokens existed have no token, so
 * they count as signed out and the user is simply asked to sign in again.
 */
const TOKEN = 'laf_token';

export const session = {
  token(): string | null {
    return localStorage.getItem(TOKEN);
  },

  userId(): number {
    return Number(localStorage.getItem('userid') || 0);
  },

  name(): string {
    return localStorage.getItem('username') || '';
  },

  isLoggedIn(): boolean {
    return !!localStorage.getItem(TOKEN) && !!localStorage.getItem('userid');
  },

  start(res: { token: string; userid: number; firstName?: string; lastName?: string }) {
    localStorage.setItem(TOKEN, res.token);
    localStorage.setItem('isLoggedin', 'token');
    localStorage.setItem('userid', String(res.userid));
    const name = `${res.firstName || ''} ${res.lastName || ''}`.trim();
    if (name) localStorage.setItem('username', name);
  },

  setName(name: string) {
    if (name.trim()) localStorage.setItem('username', name.trim());
  },

  /** Forgets everything this app stored for the signed-in user. */
  clear() {
    localStorage.clear();
  },
};
