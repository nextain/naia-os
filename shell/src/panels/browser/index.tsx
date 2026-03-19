import { panelRegistry } from "../../lib/panel-registry";
import { BrowserCenterPanel } from "./BrowserCenterPanel";

panelRegistry.register({
	id: "browser",
	name: "Browser",
	icon: "🌐",
	center: BrowserCenterPanel,
	onActivate: () => {},
	onDeactivate: () => {},
});
