import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { EveFrontierProvider } from "@evefrontier/dapp-kit";
import App from "./App";
import "./styles.css";

// Connecting is a user action in a normal browser — clear both stored-session
// triggers before any dapp-kit code can act on them (same fix as EF-Map and
// CivilizationControl, 2026-08-02). (1) mysten dapp-kit's autoConnect (default
// true since sui-2.0) reads its saved-wallet key and calls the wallet with
// {silent:true}; a locked EVE Vault answers that with its unlock popup — no
// clicks. (2) the vendored VaultProvider auto-reconnects NON-silently off its
// own flag. The literals are @mysten/dapp-kit-core's DEFAULT_STORAGE_KEY and
// @evefrontier/dapp-kit's STORAGE_KEYS.CONNECTED. In game the client wallet
// still auto-connects — see App.tsx.
try {
  localStorage.removeItem("mysten-dapp-kit:selected-wallet-and-address");
  localStorage.removeItem("eve-dapp-connected");
} catch { /* storage unavailable — nothing to clear */ }

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <EveFrontierProvider queryClient={queryClient}>
      <App />
    </EveFrontierProvider>
  </React.StrictMode>,
);

