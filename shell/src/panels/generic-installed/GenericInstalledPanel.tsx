import type { PanelCenterProps } from "../../lib/panel-registry";

/**
 * GenericInstalledPanel — placeholder center for panels loaded from ~/.naia/panels/.
 *
 * Shown when a panel manifest is loaded at runtime but its JavaScript entry
 * point has not yet been executed (dynamic JS loading is Phase 5+).
 * The panel is still listed in ModeBar and can be deleted by the user.
 */
export function GenericInstalledPanel({ naia: _naia }: PanelCenterProps) {
	return (
		<div className="generic-installed-panel">
			<div className="generic-installed-panel__icon">📦</div>
			<p className="generic-installed-panel__msg">
				이 패널은 설치됐지만 아직 로드되지 않았습니다.
			</p>
			<p className="generic-installed-panel__hint">
				패널 JS 동적 로딩은 Phase 5에서 지원됩니다.
			</p>
		</div>
	);
}
