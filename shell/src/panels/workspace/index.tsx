import { panelRegistry } from "../../lib/panel-registry";
import { WorkspaceCenterPanel } from "./WorkspaceCenterPanel";

panelRegistry.register({
	id: "workspace",
	name: "Workspace",
	names: { ko: "워크스페이스", en: "Workspace" },
	icon: "💻",
	builtIn: true,
	center: WorkspaceCenterPanel,
});
