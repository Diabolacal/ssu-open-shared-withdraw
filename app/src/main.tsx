import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { EveFrontierProvider } from "@evefrontier/dapp-kit";
import App from "./App";
import "./styles.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <EveFrontierProvider queryClient={queryClient}>
      <App />
    </EveFrontierProvider>
  </React.StrictMode>,
);

