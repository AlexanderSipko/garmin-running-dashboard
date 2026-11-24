const sdkUrl = "https://telegram.org/js/telegram-web-app.js";
let sdkRequest;
let initialized = false;

function loadTelegramSdk() {
  if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp);
  if (!sdkRequest) {
    sdkRequest = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = sdkUrl;
      script.async = true;
      script.onload = () => resolve(window.Telegram?.WebApp);
      script.onerror = () => {
        script.remove();
        reject(new Error("Telegram SDK did not load."));
      };
      document.head.append(script);
    }).catch((error) => {
      sdkRequest = undefined;
      throw error;
    });
  }
  return sdkRequest;
}

export async function initializeTelegramMiniApp() {
  if (initialized) return;
  const app = await loadTelegramSdk();
  // The SDK is also available when the entry URL opens in an ordinary browser.
  // These launch properties are used for display only. Account login stays with the backend.
  if (initialized || !app || (!app.initData && (!app.platform || app.platform === "unknown"))) return;

  initialized = true;
  document.documentElement.dataset.telegramMiniApp = "true";
  app.setHeaderColor?.("#141b20");
  app.setBackgroundColor?.("#141b20");
  app.expand?.();
  app.ready?.();
}
