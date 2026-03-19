import type { PanelCenterProps } from "../../lib/panel-registry";

/**
 * WorkspaceCenterPanel — coding workspace panel.
 *
 * The panel owns the full right area and implements its own layout.
 * Planned features: file explorer, code editor, terminal, run output.
 *
 * TODO: Implement in #92 (workspace panel)
 */
export function WorkspaceCenterPanel({ naia: _naia }: PanelCenterProps) {
	return (
		<div className="workspace-panel">
			<div className="workspace-panel__placeholder">
				<p>워크스페이스 패널 — 준비 중</p>
			</div>
		</div>
	);
}
