import { panelRegistry } from "../../lib/panel-registry";
import { BrowserCenterPanel } from "./BrowserCenterPanel";

panelRegistry.register({
	id: "browser",
	name: "Chrome",
	names: { ko: "크롬", en: "Chrome" },
	icon: "🌐",
	builtIn: true,
	center: BrowserCenterPanel,
	tools: [
		{
			name: "skill_browser_navigate",
			description:
				"Navigate the browser to a URL. Use this when the user asks you to open, visit, or go to a website.",
			parameters: {
				type: "object",
				properties: {
					url: {
						type: "string",
						description: "The URL to navigate to (e.g. https://example.com)",
					},
				},
				required: ["url"],
			},
			tier: 1,
		},
		{
			name: "skill_browser_snapshot",
			description:
				"Get an accessibility tree snapshot of the current browser page. Returns interactive elements with @ref IDs you can use for click and fill commands. Use this to read page content or find elements before interacting.",
			parameters: {
				type: "object",
				properties: {},
			},
			tier: 0,
		},
		{
			name: "skill_browser_click",
			description:
				"Click an element in the browser. Use the @ref ID from a snapshot (e.g. @e3). Use skill_browser_snapshot first to find the right element.",
			parameters: {
				type: "object",
				properties: {
					ref: {
						type: "string",
						description: "Element reference from snapshot (e.g. @e3) or a CSS selector",
					},
				},
				required: ["ref"],
			},
			tier: 1,
		},
		{
			name: "skill_browser_fill",
			description:
				"Clear and fill a text input in the browser. Use the @ref ID from a snapshot. Replaces existing text.",
			parameters: {
				type: "object",
				properties: {
					ref: {
						type: "string",
						description: "Input element reference from snapshot (e.g. @e5)",
					},
					text: {
						type: "string",
						description: "Text to type into the input",
					},
				},
				required: ["ref", "text"],
			},
			tier: 1,
		},
		{
			name: "skill_browser_get_text",
			description:
				"Get the visible text from an element or the whole page body. Pass a @ref from snapshot for a specific element, or leave empty for the full page.",
			parameters: {
				type: "object",
				properties: {
					ref: {
						type: "string",
						description: "Element reference from snapshot, or empty for full page text",
					},
				},
			},
			tier: 0,
		},
	],
});
