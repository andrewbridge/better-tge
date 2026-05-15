import { createApp, watch } from "./deps/vue.mjs";
import App from "./components/App.mjs";
import "./services/data/festival-data.mjs";
import { applicationReady, applicationError } from "./services/data/lifecycle.mjs";

const root = document.getElementById("root");
const boot = document.getElementById("boot");

// Mount the app; boot screen stays visible until data + DOM both signal ready.
const app = createApp(App);
app.mount(root);

// Hide boot screen when app is ready or errored
const stop = watch([applicationReady, applicationError], () => {
  if (applicationReady.value || applicationError.value) {
    if (boot) {
      boot.style.opacity = "0";
      boot.style.transition = "opacity 0.2s";
      setTimeout(() => boot.remove(), 220);
    }
    stop();
  }
});

if (
  "serviceWorker" in navigator &&
  location.hostname !== "localhost" &&
  location.hostname !== "127.0.0.1"
) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
