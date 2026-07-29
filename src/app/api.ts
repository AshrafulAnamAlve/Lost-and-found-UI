// Backend origin derived from how the page was opened, so the app works on
// localhost AND from another device on the same network. When the UI is opened
// as https://192.168.0.103:4200, API/SignalR calls go to https://192.168.0.103:7124.
export const API_ORIGIN = `https://${location.hostname}:7124`;
