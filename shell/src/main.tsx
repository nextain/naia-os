import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/global.css";

// Auto-register all providers (must happen before any UI renders)
import "./lib/providers/llm";
import "./lib/providers/tts";
import "./lib/providers/stt";

// biome-ignore lint/style/noNonNullAssertion: root element always exists
createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
