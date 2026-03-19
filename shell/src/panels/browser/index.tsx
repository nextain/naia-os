import { panelRegistry } from "../../lib/panel-registry";
import { BrowserCenterPanel } from "./BrowserCenterPanel";

panelRegistry.register({
	id: "browser",
	name: "Chrome",
	names: { ko: "크롬", en: "Chrome" },
	icon: "🌐",
	builtIn: true,
	center: BrowserCenterPanel,
});
