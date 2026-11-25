// Bridge to native features. Works in the browser too (falls back to web APIs).
(function () {
  const Cap = window.Capacitor;
  const platform = Cap?.getPlatform?.() || "web";
  const isNative = platform === "ios" || platform === "android";
  const P = name => Cap?.Plugins?.[name];

  async function b64ToBlob(b64, type) {
    const bin = atob(b64), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type });
  }

  const Native = {
    platform, isNative,

    /** Returns a Blob (photo) or null if cancelled. Web: falls back to a file input. */
    async takePhoto() {
      const Camera = P("Camera");
      if (isNative && Camera) {
        try {
          const r = await Camera.getPhoto({ quality: 80, resultType: "base64", source: "PROMPT", width: 1600,
            correctOrientation: true, saveToGallery: false, promptLabelHeader: "Mahlzeit",
            promptLabelPhoto: "Aus der Galerie wählen", promptLabelPicture: "Foto aufnehmen", promptLabelCancel: "Abbrechen" });
          return b64ToBlob(r.base64String, "image/" + (r.format || "jpeg"));
        } catch (e) { if (/cancel/i.test(String(e?.message || e))) return null; throw e; }
      }
      return new Promise(resolve => {
        const inp = document.createElement("input");
        inp.type = "file"; inp.accept = "image/*"; inp.capture = "environment";
        inp.onchange = () => resolve(inp.files[0] || null);
        inp.click();
      });
    },

    // ------------------------------------------------------------ purchases (RevenueCat)
    purchasesAvailable() { return isNative && !!P("Purchases") && !!TB_CONFIG.revenuecat[platform]; },

    async initPurchases(userId) {
      if (!this.purchasesAvailable()) return;
      const Purchases = P("Purchases");
      if (!this._configured) {
        await Purchases.configure({ apiKey: TB_CONFIG.revenuecat[platform], appUserID: userId });
        this._configured = true;
      } else {
        await Purchases.logIn({ appUserID: userId });
      }
    },
    async logoutPurchases() { if (this._configured) { try { await P("Purchases").logOut(); } catch {} } },

    async getPackages() {
      if (!this.purchasesAvailable()) return [];
      const o = await P("Purchases").getOfferings();
      return o?.current?.availablePackages || [];
    },
    async buy(pkg) {
      const r = await P("Purchases").purchasePackage({ aPackage: pkg });
      return !!r?.customerInfo?.entitlements?.active?.[TB_CONFIG.entitlement];
    },
    async restore() {
      const r = await P("Purchases").restorePurchases();
      return !!r?.customerInfo?.entitlements?.active?.[TB_CONFIG.entitlement];
    },
    manageSubscriptionsUrl() {
      return platform === "android" ? "https://play.google.com/store/account/subscriptions" : "https://apps.apple.com/account/subscriptions";
    },
    async openUrl(url) {
      const Browser = P("Browser");
      if (isNative && Browser) return Browser.open({ url });
      window.open(url, "_blank", "noopener");
    },
  };
  window.Native = Native;
})();
