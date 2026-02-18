import { S } from "./selectors.js";

/**
 * Fill the settings modal and save.
 * Assumes the settings modal is already visible.
 */
export async function configureSettings(opts: {
	provider: string;
	apiKey: string;
	gatewayUrl: string;
	gatewayToken: string;
}): Promise<void> {
	// Provider
	const providerSelect = await $(S.providerSelect);
	await providerSelect.waitForDisplayed({ timeout: 10_000 });
	await providerSelect.selectByAttribute("value", opts.provider);

	// API Key
	const apiKeyInput = await $(S.apiKeyInput);
	await apiKeyInput.waitForDisplayed();
	await apiKeyInput.setValue(opts.apiKey);

	// Enable tools
	const toolsToggle = await $(S.toolsToggle);
	const isChecked = await toolsToggle.isSelected();
	if (!isChecked) {
		await toolsToggle.click();
	}

	// Gateway URL
	const gatewayUrlInput = await $(S.gatewayUrlInput);
	await gatewayUrlInput.clearValue();
	await gatewayUrlInput.setValue(opts.gatewayUrl);

	// Gateway Token
	const gatewayTokenInput = await $(S.gatewayTokenInput);
	await gatewayTokenInput.clearValue();
	await gatewayTokenInput.setValue(opts.gatewayToken);

	// Save
	const saveBtn = await $(S.settingsSaveBtn);
	await saveBtn.click();

	// Wait for modal to close
	const modal = await $(S.settingsModal);
	await modal.waitForDisplayed({ timeout: 10_000, reverse: true });
}
