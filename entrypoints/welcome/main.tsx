import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Welcome from "@/components/welcome/Welcome";
import "@/assets/tailwind.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Welcome />
  </StrictMode>,
);
