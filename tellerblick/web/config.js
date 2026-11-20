// Runtime configuration. mobile/build.mjs overwrites this file inside the native app bundle.
window.TB_CONFIG = {
  // "" = same origin (web version served by the API). Native apps: "https://api.your-domain.de"
  apiBase: "",
  // RevenueCat *public* SDK keys (safe to ship in the app)
  revenuecat: { ios: "", android: "" },
  entitlement: "premium",
  supportEmail: "support@example.com",
  privacyUrl: "/legal/datenschutz.html",
  termsUrl: "/legal/nutzungsbedingungen.html",
  imprintUrl: "/legal/impressum.html",
  version: "1.0.0",
};
