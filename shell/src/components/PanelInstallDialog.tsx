import { listen } from "@tauri-apps/api/event";
import { open as openFilePicker } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";
import { sendPanelInstall } from "../lib/chat-service";
import { loadInstalledPanels } from "../lib/panel-loader";
import { Logger } from "../lib/logger";
import { usePanelStore } from "../stores/panel";

interface PanelInstallDialogProps {
	onClose: () => void;
}

type Mode = "git" | "file";

interface InstallResult {
	success: boolean;
	message: string;
}

export function PanelInstallDialog({ onClose }: PanelInstallDialogProps) {
	const [mode, setMode] = useState<Mode>("git");
	const [gitUrl, setGitUrl] = useState("");
	const [filePath, setFilePath] = useState("");
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<InstallResult | null>(null);
	const successRef = useRef(false);
	const pushModal = usePanelStore((s) => s.pushModal);
	const popModal = usePanelStore((s) => s.popModal);

	// Hide Chrome X11 embed while dialog is open
	useEffect(() => {
		pushModal();
		return () => popModal();
	}, [pushModal, popModal]);

	// Listen for panel_install_result and panel_control reload from agent
	useEffect(() => {
		let unlistenFn: (() => void) | null = null;

		const setup = async () => {
			const unlisten = await listen<string>("agent_response", (event) => {
				try {
					const raw =
						typeof event.payload === "string"
							? event.payload
							: JSON.stringify(event.payload);
					const chunk = JSON.parse(raw) as { type: string; [k: string]: unknown };

					if (chunk.type === "panel_install_result") {
						const success = chunk.success as boolean;
						const message = success
							? (chunk.output as string)
							: ((chunk.error as string | undefined) ?? (chunk.output as string));
						setResult({ success, message });
						setLoading(false);
						successRef.current = success;
					} else if (
						chunk.type === "panel_control" &&
						chunk.action === "reload" &&
						successRef.current
					) {
						// Reload triggered by successful install — refresh panel list then close
						loadInstalledPanels()
							.catch(() => {})
							.finally(() => {
								onClose();
							});
					}
				} catch {
					// Ignore parse errors
				}
			});
			unlistenFn = unlisten;
		};

		setup().catch(() => {});
		return () => {
			unlistenFn?.();
		};
	}, [onClose]);

	async function handlePickFile() {
		const selected = await openFilePicker({
			title: "패널 zip 파일 선택",
			filters: [{ name: "Zip", extensions: ["zip"] }],
			multiple: false,
		});
		if (typeof selected === "string") {
			setFilePath(selected);
		}
	}

	async function handleInstall() {
		const source = mode === "git" ? gitUrl.trim() : filePath.trim();
		if (!source) return;

		setLoading(true);
		setResult(null);
		successRef.current = false;
		Logger.info("PanelInstallDialog", `Installing panel from ${mode}: ${source}`);
		try {
			await sendPanelInstall(source);
		} catch (err) {
			setLoading(false);
			setResult({ success: false, message: String(err) });
		}
	}

	return (
		<div className="panel-install-overlay" onClick={onClose} onKeyDown={() => {}}>
			<div
				className="panel-install-dialog"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => {}}
			>
				<div className="panel-install-header">
					<span className="panel-install-title">패널 추가</span>
					<button type="button" className="panel-install-close" onClick={onClose}>
						✕
					</button>
				</div>

				{mode === "git" ? (
					<div className="panel-install-body">
						<label className="panel-install-label" htmlFor="git-url-input">
							Git URL
						</label>
						<input
							id="git-url-input"
							type="text"
							className="panel-install-input"
							placeholder="https://github.com/user/my-panel.git"
							value={gitUrl}
							onChange={(e) => setGitUrl(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && handleInstall()}
							disabled={loading}
						/>
						<p className="panel-install-hint">
							비공개 저장소: URL에 토큰 포함 (https://TOKEN@github.com/...)
						</p>
					</div>
				) : (
					<div className="panel-install-body">
						<label className="panel-install-label" htmlFor="file-path-input">
							Zip 파일 경로
						</label>
						<div className="panel-install-file-row">
							<input
								id="file-path-input"
								type="text"
								className="panel-install-input"
								placeholder="/path/to/my-panel.zip"
								value={filePath}
								onChange={(e) => setFilePath(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && handleInstall()}
								disabled={loading}
							/>
							<button
								type="button"
								className="panel-install-pick-btn"
								onClick={handlePickFile}
								disabled={loading}
							>
								선택
							</button>
						</div>
					</div>
				)}

				{result && (
					<div
						className={`panel-install-result ${result.success ? "success" : "error"}`}
					>
						{result.message}
					</div>
				)}

				<div className="panel-install-footer">
					<div className="panel-install-tabs">
						<button
							type="button"
							className={`panel-install-tab${mode === "git" ? " active" : ""}`}
							onClick={() => setMode("git")}
						>
							Git URL
						</button>
						<button
							type="button"
							className={`panel-install-tab${mode === "file" ? " active" : ""}`}
							onClick={() => setMode("file")}
						>
							파일 (Zip)
						</button>
					</div>
					<button
						type="button"
						className="panel-install-cancel-btn"
						onClick={onClose}
						disabled={loading}
					>
						취소
					</button>
					<button
						type="button"
						className="panel-install-confirm-btn"
						onClick={handleInstall}
						disabled={loading || (mode === "git" ? !gitUrl.trim() : !filePath.trim())}
					>
						{loading ? "설치 중..." : "추가"}
					</button>
				</div>
			</div>
		</div>
	);
}
