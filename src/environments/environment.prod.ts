// Production. The UI is served as a static site (GitHub Pages) and talks to the
// deployed ASP.NET Core API over HTTPS - same scheme as the page, so no mixed
// content, and the API's CORS policy allows any origin with credentials
// (needed by the SignalR chat hub).
export const environment = {
  production: true,
  apiOrigin: 'https://lostandfoundd.runasp.net',
};
