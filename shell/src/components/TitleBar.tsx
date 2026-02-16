import { getCurrentWindow } from "@tauri-apps/api/window";

export function TitleBar() {
	const appWindow = getCurrentWindow();

	function handleDragStart(e: React.MouseEvent) {
		// Only drag from the titlebar itself, not from buttons
		if ((e.target as HTMLElement).closest(".titlebar-buttons")) return;
		e.preventDefault();
		appWindow.startDragging();
	}

	return (
		<div className="titlebar" onMouseDown={handleDragStart}>
			<span className="titlebar-label">Cafelua</span>
			<div className="titlebar-buttons">
				<button
					type="button"
					className="titlebar-btn"
					onClick={() => appWindow.minimize()}
					title="최소화"
				>
					&#8211;
				</button>
				<button
					type="button"
					className="titlebar-btn"
					onClick={async () => {
						if (await appWindow.isMaximized()) {
							appWindow.unmaximize();
						} else {
							appWindow.maximize();
						}
					}}
					title="최대화"
				>
					&#9633;
				</button>
				<button
					type="button"
					className="titlebar-btn titlebar-btn-close"
					onClick={() => appWindow.close()}
					title="닫기"
				>
					&#10005;
				</button>
			</div>
		</div>
	);
}
