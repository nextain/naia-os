import { expect, test } from "@playwright/test";

/**
 * Browser Panel E2E — keepAlive + Modal hide/show + AI toolbar wrap
 *
 * Prerequisites:
 *   pnpm dev  (Vite serves UI at localhost:1420)
 *
 * Test approach:
 *   Playwright opens localhost:1420 in a regular browser.
 *   Tauri IPC is mocked via addInitScript.
 *   - browser_embed_hide / browser_embed_show calls are tracked in window.__invokeLog
 *   - useChatStore is exposed at window.useChatStore for direct store access
 *
 * Scenarios:
 *   B1: BrowserCenterPanel DOM is attached even when another panel is active (keepAlive:true)
 *   B2: Switching away from browser tab calls browser_embed_hide
 *   B3: Switching back to browser tab calls browser_embed_show
 *   B4: setPendingApproval while browser is active calls browser_embed_hide
 *   B5: AI toolbar wraps at narrow viewport (no overflow)
 *   B6: clearPendingApproval while browser is active calls browser_embed_show
 *   B7: finishStreaming with pending approval calls browser_embed_show
 */

const TAURI_MOCK_SCRIPT = `
(function() {
	window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
	window.__TAURI_EVENT_PLUGIN_INTERNALS__ = window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {};

	window.__TAURI_INTERNALS__.metadata = {
		currentWindow: { label: "main" },
		currentWebview: { windowLabel: "main", label: "main" },
	};

	var callbacks = new Map();
	var nextCbId = 1;
	window.__TAURI_INTERNALS__.transformCallback = function(fn, once) {
		var id = nextCbId++;
		callbacks.set(id, function(data) { if (once) callbacks.delete(id); return fn && fn(data); });
		return id;
	};
	window.__TAURI_INTERNALS__.unregisterCallback = function(id) { callbacks.delete(id); };
	window.__TAURI_INTERNALS__.runCallback = function(id, data) { var cb = callbacks.get(id); if (cb) cb(data); };
	window.__TAURI_INTERNALS__.callbacks = callbacks;

	var eventListeners = new Map();
	window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener = function() {};

	window.__TAURI_INTERNALS__.convertFileSrc = function(p, proto) {
		return (proto || "asset") + "://localhost/" + encodeURIComponent(p);
	};

	// Track invoke calls for assertions
	window.__invokeLog = [];

	window.__TAURI_INTERNALS__.invoke = async function(cmd, args) {
		// Record relevant IPC calls
		if (cmd === "browser_embed_hide" || cmd === "browser_embed_show"
				|| cmd === "browser_embed_init" || cmd === "browser_embed_close") {
			window.__invokeLog.push(cmd);
		}

		// Event system
		if (cmd === "plugin:event|listen") {
			if (!eventListeners.has(args.event)) eventListeners.set(args.event, []);
			eventListeners.get(args.event).push(args.handler);
			return args.handler;
		}
		if (cmd === "plugin:event|emit") { return null; }
		if (cmd === "plugin:event|unlisten") return;

		// Window management
		if (cmd === "plugin:window|get_cursor_position" || cmd === "plugin:window|start_resize_dragging") return null;

		// Agent / UI
		if (cmd === "send_to_agent_command" || cmd === "cancel_stream") return;
		if (cmd === "frontend_log") return;
		if (cmd === "list_skills") return [];
		if (cmd === "list_stt_models") return [];
		if (cmd === "panel_list_installed") return [];

		// Browser commands — all succeed silently in tests
		if (cmd === "browser_embed_init") return;
		if (cmd === "browser_embed_hide") return;
		if (cmd === "browser_embed_show") return;
		if (cmd === "browser_embed_close") return;
		if (cmd === "browser_embed_navigate") return;
		if (cmd === "browser_embed_focus") return;
		if (cmd === "browser_embed_resize") return;
		if (cmd === "browser_check") return true;
		if (cmd === "browser_set_permission") return;

		// Workspace
		if (cmd === "workspace_get_sessions") return [];
		if (cmd === "workspace_list_dirs") return [];
		if (cmd === "workspace_get_git_info") return { branch: "main" };
		if (cmd === "workspace_get_progress") return null;
		if (cmd === "workspace_start_watch") return;
		if (cmd === "workspace_stop_watch") return;
		if (cmd === "workspace_classify_dirs") return [];

		return undefined;
	};
})();
`;

/** Common beforeEach: inject mock + config + navigate to "/" */
async function setupPage(page: import("@playwright/test").Page) {
	await page.addInitScript(TAURI_MOCK_SCRIPT);

	await page.addInitScript(() => {
		localStorage.setItem("naia-config", JSON.stringify({
			provider: "gemini",
			model: "gemini-2.5-flash",
			apiKey: "e2e-mock-key",
			locale: "ko",
			onboardingComplete: true,
		}));
	});

	await page.goto("/");
	await expect(page.locator(".chat-panel")).toBeVisible({ timeout: 15_000 });
}

test.describe("Browser Panel E2E", () => {

	// ── B1: keepAlive — BrowserCenterPanel DOM survives tab switch ─────────

	test("B1: 다른 패널로 전환해도 .browser-panel DOM이 유지됨 (keepAlive:true)", async ({ page }) => {
		await setupPage(page);

		// Browser panel should be the default active panel
		await expect(page.locator(".browser-panel")).toBeAttached({ timeout: 8_000 });

		// Switch to workspace panel
		const workspaceTab = page.locator('button[data-panel-id="workspace"]');
		const hasWorkspaceTab = await workspaceTab.isVisible({ timeout: 3_000 }).catch(() => false);

		if (hasWorkspaceTab) {
			await workspaceTab.click();
			// browser-panel DOM must still be attached (keepAlive:true prevents unmount)
			await expect(page.locator(".browser-panel")).toBeAttached({ timeout: 3_000 });
		} else {
			// Fallback: just confirm it's attached on the default view
			await expect(page.locator(".browser-panel")).toBeAttached();
		}
	});

	// ── B2: Tab switch away → browser_embed_hide called ──────────────────

	test("B2: browser 탭에서 다른 탭으로 전환 시 browser_embed_hide 호출됨", async ({ page }) => {
		await setupPage(page);

		// Clear invoke log baseline
		await page.evaluate(() => { window.__invokeLog = []; });

		// Find any non-browser panel tab
		const workspaceTab = page.locator('button[data-panel-id="workspace"]');
		const hasWorkspaceTab = await workspaceTab.isVisible({ timeout: 3_000 }).catch(() => false);

		if (!hasWorkspaceTab) {
			test.skip(true, "workspace 탭 없음 — B2 스킵");
			return;
		}

		// Default activePanel is "browser" — just clear log and switch away
		// (do NOT click browserTab first — that would toggle it off and break the test)
		await page.evaluate(() => { window.__invokeLog = []; });

		// Switch away
		await workspaceTab.click();

		// browser_embed_hide should have been invoked
		const log = await page.evaluate(() => window.__invokeLog as string[]);
		expect(log).toContain("browser_embed_hide");
	});

	// ── B3: Tab switch back → browser_embed_show called ──────────────────

	test("B3: 다른 탭에서 browser 탭으로 돌아올 때 browser_embed_show 호출됨", async ({ page }) => {
		await setupPage(page);

		const workspaceTab = page.locator('button[data-panel-id="workspace"]');
		const browserTab = page.locator('button[data-panel-id="browser"]');

		const hasBoth = await workspaceTab.isVisible({ timeout: 3_000 }).catch(() => false)
			&& await browserTab.isVisible({ timeout: 3_000 }).catch(() => false);

		if (!hasBoth) {
			test.skip(true, "workspace/browser 탭 없음 — B3 스킵");
			return;
		}

		// Switch away first
		await workspaceTab.click();

		// Clear log
		await page.evaluate(() => { window.__invokeLog = []; });

		// Switch back to browser
		await browserTab.click();

		const log = await page.evaluate(() => window.__invokeLog as string[]);
		expect(log).toContain("browser_embed_show");
	});

	// ── B4: setPendingApproval → browser_embed_hide called ───────────────

	test("B4: setPendingApproval 호출 시 browser panel 활성 중이면 browser_embed_hide 호출됨", async ({ page }) => {
		await setupPage(page);

		// Ensure browser panel is active (default)
		await expect(page.locator(".browser-panel")).toBeAttached({ timeout: 8_000 });

		// Clear log
		await page.evaluate(() => { window.__invokeLog = []; });

		// Call setPendingApproval directly via exposed store
		await page.evaluate(() => {
			const store = (window as any).useChatStore;
			if (!store) throw new Error("useChatStore not exposed on window");
			store.getState().setPendingApproval({
				requestId: "test-req-1",
				toolCallId: "test-tc-1",
				toolName: "test_tool",
				args: {},
				tier: 2,
				description: "Test permission request",
			});
		});

		// browser_embed_hide must have been called synchronously
		const log = await page.evaluate(() => window.__invokeLog as string[]);
		expect(log).toContain("browser_embed_hide");
	});

	// ── B5: AI toolbar wraps at narrow viewport ───────────────────────────

	test("B5: 좁은 뷰포트(600px)에서 AI toolbar가 overflow 없이 표시됨", async ({ page }) => {
		// Set narrow viewport
		await page.setViewportSize({ width: 600, height: 768 });
		await setupPage(page);

		// Browser panel must be mounted
		await expect(page.locator(".browser-panel")).toBeAttached({ timeout: 8_000 });

		// The toolbar is only rendered when status === "ready".
		// In E2E mock, browser_check returns true and browser_embed_init is a no-op,
		// so the panel reaches "ready" status. Check structural properties of toolbar CSS.
		// We test: toolbar element allows wrapping (overflow-x should NOT clip content).
		const toolbar = page.locator(".browser-panel__ai-toolbar");

		// If toolbar exists, check it doesn't have fixed height that would clip
		const isPresent = await toolbar.count();
		if (isPresent > 0) {
			// scrollWidth <= clientWidth means no horizontal overflow
			const noHorizontalOverflow = await toolbar.evaluate((el) => {
				return el.scrollWidth <= el.clientWidth + 2; // 2px tolerance
			});
			expect(noHorizontalOverflow).toBe(true);
		}

		// Also verify .browser-panel itself is present and fits viewport
		const panelFitsViewport = await page.locator(".browser-panel").evaluate((el) => {
			const rect = el.getBoundingClientRect();
			return rect.right <= window.innerWidth + 2;
		});
		expect(panelFitsViewport).toBe(true);
	});

	// ── B6: clearPendingApproval (modal dismiss) → browser_embed_show ────

	test("B6: pendingApproval 해제 후 browser panel 활성 중이면 browser_embed_show 호출됨", async ({ page }) => {
		await setupPage(page);

		await expect(page.locator(".browser-panel")).toBeAttached({ timeout: 8_000 });

		// Set pending approval first
		await page.evaluate(() => {
			const store = (window as any).useChatStore;
			if (!store) throw new Error("useChatStore not exposed on window");
			store.getState().setPendingApproval({
				requestId: "test-req-2",
				toolCallId: "test-tc-2",
				toolName: "test_tool",
				args: {},
				tier: 2,
				description: "Test",
			});
		});

		// Clear log after setting approval
		await page.evaluate(() => { window.__invokeLog = []; });

		// Now clear the approval (simulate modal dismiss)
		await page.evaluate(() => {
			const store = (window as any).useChatStore;
			store.getState().clearPendingApproval();
		});

		// mock invoke is synchronous — no waitForTimeout needed
		const log = await page.evaluate(() => window.__invokeLog as string[]);
		expect(log).toContain("browser_embed_show");
	});

	// ── B7: finishStreaming with pending approval → browser_embed_show ────

	test("B7: pendingApproval 중 finishStreaming 시 browser_embed_show 호출됨", async ({ page }) => {
		await setupPage(page);

		await expect(page.locator(".browser-panel")).toBeAttached({ timeout: 8_000 });

		// Set pending approval
		await page.evaluate(() => {
			const store = (window as any).useChatStore;
			if (!store) throw new Error("useChatStore not exposed on window");
			store.getState().setPendingApproval({
				requestId: "test-req-3",
				toolCallId: "test-tc-3",
				toolName: "test_tool",
				args: {},
				tier: 2,
				description: "Test",
			});
		});

		// Simulate streaming start (required for finishStreaming guard)
		await page.evaluate(() => {
			const store = (window as any).useChatStore;
			store.setState({ isStreaming: true });
		});

		// Clear log
		await page.evaluate(() => { window.__invokeLog = []; });

		// Call finishStreaming (e.g. stream error path)
		await page.evaluate(() => {
			const store = (window as any).useChatStore;
			store.getState().finishStreaming();
		});

		const log = await page.evaluate(() => window.__invokeLog as string[]);
		expect(log).toContain("browser_embed_show");
	});
});
