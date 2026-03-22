import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { Logger } from "../../lib/logger";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
	pty_id: string;
	active: boolean;
	onExit: (pty_id: string) => void;
}

export function Terminal({ pty_id, active, onExit }: TerminalProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const termRef = useRef<XTerminal | null>(null);
	const fitRef = useRef<FitAddon | null>(null);
	const activeRef = useRef(active);
	activeRef.current = active;
	const onExitRef = useRef(onExit);
	onExitRef.current = onExit;

	// Initialize xterm once per pty_id
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const term = new XTerminal({
			fontFamily: "'Fira Code', 'Noto Sans Mono', monospace",
			fontSize: 13,
			theme: { background: "#1a1a1a", foreground: "#d0d0d0" },
			scrollback: 2000,
			cursorBlink: true,
		});
		const fit = new FitAddon();
		term.loadAddon(fit);
		term.open(container);
		fit.fit();

		termRef.current = term;
		fitRef.current = fit;

		// Cancellation flag: if component unmounts before listen() resolves,
		// immediately call the returned unlisten fn to avoid listener leaks.
		let cancelled = false;
		const pendingUnlistens: Array<() => void> = [];

		listen<string>(`pty:output:${pty_id}`, (e) => {
			term.write(e.payload);
		}).then((fn) => {
			if (cancelled) {
				fn();
				return;
			}
			pendingUnlistens.push(fn);
		});

		listen<void>(`pty:exit:${pty_id}`, () => {
			// If cancelled, skip everything. Edge case: if the process exits in the narrow
			// window between listen() call and Promise resolution AND the component unmounts
			// concurrently, the event fires once without being handled. This leaves the tab
			// in the parent's state (zombie). In practice this race is negligible because
			// the process (bash) stays alive until explicitly killed — the listen() IPC
			// round-trip resolves in milliseconds, long before any user-initiated kill.
			if (cancelled) return;
			if (termRef.current) {
				termRef.current.write("\r\n[프로세스 종료]\r\n");
			}
			onExitRef.current(pty_id);
		}).then((fn) => {
			if (cancelled) {
				fn();
				return;
			}
			pendingUnlistens.push(fn);
		});

		const onDataDisposer = term.onData((data) => {
			invoke("pty_write", { pty_id, data }).catch((e) => {
				Logger.warn("Terminal", "pty_write error", { error: String(e) });
			});
		});

		const observer = new ResizeObserver(() => {
			if (!activeRef.current || !fitRef.current || !termRef.current) return;
			fitRef.current.fit();
			const { rows, cols } = termRef.current;
			// Guard: FitAddon returns 0 when container size is 0; don't send 0×0 to PTY
			if (!rows || !cols) return;
			invoke("pty_resize", { pty_id, rows, cols }).catch(() => {});
		});
		observer.observe(container);

		return () => {
			cancelled = true;
			observer.disconnect(); // no new callbacks after this
			for (const fn of pendingUnlistens) fn();
			onDataDisposer.dispose();
			// Null refs synchronously before dispose. JS is single-threaded so no
			// ResizeObserver callback can fire between these lines; the null guard
			// in the observer callback is a second-layer defence against any
			// already-queued entry that was in the task queue before disconnect().
			termRef.current = null;
			fitRef.current = null;
			term.dispose();
		};
	}, [pty_id]);

	// Fit when becoming active (opacity:0 → visible transition)
	useEffect(() => {
		if (!active) return;
		const id = setTimeout(() => {
			if (!fitRef.current || !termRef.current) return;
			fitRef.current.fit();
			const { rows, cols } = termRef.current;
			if (!rows || !cols) return;
			invoke("pty_resize", { pty_id, rows, cols }).catch(() => {});
		}, 50);
		return () => clearTimeout(id);
	}, [active, pty_id]);

	// CSS class provides: position:absolute; inset:0; overflow:hidden
	// (global.css .workspace-panel__terminal) — required for keepAlive stacking.
	// Inactive terminals are hidden via inline opacity:0 + pointerEvents:none only.
	return (
		<div
			ref={containerRef}
			className="workspace-panel__terminal"
			style={active ? undefined : { opacity: 0, pointerEvents: "none" }}
		/>
	);
}
