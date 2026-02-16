import { cleanup, fireEvent, render, screen } from "@testing-library/react";
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsModal } from "../SettingsModal";

describe("SettingsModal", () => {
	afterEach(() => {
		cleanup();
		localStorage.clear();
	});

	it("renders provider select, API key input, and save button", () => {
		render(<SettingsModal onClose={() => {}} />);
		expect(screen.getByLabelText(/provider|프로바이더/i)).toBeDefined();
		expect(screen.getByLabelText(/^API/i)).toBeDefined();
		expect(screen.getByText(/save|저장/i)).toBeDefined();
	});

	it("shows error for empty API key on save", () => {
		render(<SettingsModal onClose={() => {}} />);
		fireEvent.click(screen.getByText(/save|저장/i));
		expect(screen.getByText(/입력해주세요|enter.*api/i)).toBeDefined();
	});

	it("saves config and calls onClose", () => {
		const onClose = vi.fn();
		render(<SettingsModal onClose={onClose} />);

		const apiKeyInput = screen.getByLabelText(/^API/i);
		fireEvent.change(apiKeyInput, {
			target: { value: "test-key-123" },
		});
		fireEvent.click(screen.getByText(/save|저장/i));

		expect(onClose).toHaveBeenCalled();

		// Verify saved in localStorage
		const saved = JSON.parse(localStorage.getItem("cafelua-config") || "{}");
		expect(saved.apiKey).toBe("test-key-123");
	});

	it("renders language selector", () => {
		render(<SettingsModal onClose={() => {}} />);
		expect(screen.getByLabelText(/language|언어/i)).toBeDefined();
		expect(screen.getByText("한국어")).toBeDefined();
		expect(screen.getByText("English")).toBeDefined();
	});
});
