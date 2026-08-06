// Development. Replaced at build time by environment.prod.ts (see angular.json
// -> configurations.production.fileReplacements).
export const environment = {
  production: false,
  // Empty means "derive the origin from how the page was opened", so the app
  // works on localhost AND from another device on the same network
  // (https://192.168.0.103:4200 -> https://192.168.0.103:7124). See api.ts.
  apiOrigin: '',
};
