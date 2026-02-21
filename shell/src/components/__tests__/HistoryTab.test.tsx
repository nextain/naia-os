import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "../../stores/chat";

// Mock gateway-sessions module
const mockListGatewaySessions = vi.fn();
const mockGetGatewayHistory = vi.fn();
const mockDeleteGatewaySession = vi.fn();

vi.mock("../../lib/gateway-sessions", () => ({
	listGatewaySessions: (...args: unknown[]) => mockListGatewaySessions(...args),
	getGatewayHistory: (...args: unknown[]) => mockGetGatewayHistory(...args),
	deleteGatewaySession: (...args: unknown[]) => mockDeleteGatewaySession(...args),
}));

// Import after mocks
import { HistoryTab } from "../HistoryTab";

describe("HistoryTab", () => {
	const onLoadSession = vi.fn();

	afterEach(() => {
		cleanup();
		mockListGatewaySessions.mockReset();
		mockGetGatewayHistory.mockReset();
		mockDeleteGatewaySession.mockReset();
		onLoadSession.mockReset();
		useChatStore.setState(useChatStore.getInitialState());
	});

	it("shows empty state when no sessions", async () => {
		mockListGatewaySessions.mockResolvedValue([]);
		render(<HistoryTab onLoadSession={onLoadSession} />);
		await waitFor(() => {
			expect(screen.getByText(/대화 기록이 없|No conversation/)).toBeDefined();
		});
	});

	it("renders session list", async () => {
		mockListGatewaySessions.mockResolvedValue([
			{
				key: "agent:main:main",
				label: "Test Session",
				messageCount: 5,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			},
		]);

		render(<HistoryTab onLoadSession={onLoadSession} />);
		await waitFor(() => {
			expect(screen.getByText("Test Session")).toBeDefined();
		});
	});

	it("marks current session", async () => {
		useChatStore.setState({ sessionId: "agent:main:main" });
		mockListGatewaySessions.mockResolvedValue([
			{
				key: "agent:main:main",
				label: "Current",
				messageCount: 3,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			},
		]);

		const { container } = render(<HistoryTab onLoadSession={onLoadSession} />);
		await waitFor(() => {
			const current = container.querySelector(".history-item.current");
			expect(current).not.toBeNull();
		});
	});

	it("loads session on click", async () => {
		mockListGatewaySessions.mockResolvedValue([
			{
				key: "discord:channel:123",
				label: "Discord Chat",
				messageCount: 2,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			},
		]);
		mockGetGatewayHistory.mockResolvedValue([
			{
				id: "gw-1",
				role: "user",
				content: "Hello from Discord",
				timestamp: 1000,
			},
		]);

		render(<HistoryTab onLoadSession={onLoadSession} />);
		await waitFor(() => {
			expect(screen.getByText("Discord Chat")).toBeDefined();
		});

		const btn = screen.getByText("Discord Chat");
		fireEvent.click(btn);

		await waitFor(() => {
			expect(onLoadSession).toHaveBeenCalled();
			const state = useChatStore.getState();
			expect(state.sessionId).toBe("discord:channel:123");
			expect(state.messages).toHaveLength(1);
		});
	});

	it("deletes session on confirm", async () => {
		vi.spyOn(window, "confirm").mockReturnValue(true);
		mockListGatewaySessions.mockResolvedValue([
			{
				key: "agent:main:old",
				label: "To Delete",
				messageCount: 1,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			},
		]);
		mockDeleteGatewaySession.mockResolvedValue(true);

		const { container } = render(<HistoryTab onLoadSession={onLoadSession} />);
		await waitFor(() => {
			expect(screen.getByText("To Delete")).toBeDefined();
		});

		const deleteBtn = container.querySelector(".history-delete-btn");
		expect(deleteBtn).not.toBeNull();
		fireEvent.click(deleteBtn!);

		await waitFor(() => {
			expect(mockDeleteGatewaySession).toHaveBeenCalledWith("agent:main:old");
		});
	});
});
