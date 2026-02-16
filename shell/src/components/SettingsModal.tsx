import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import {
	type ThemeId,
	getDefaultModel,
	loadConfig,
	saveConfig,
} from "../lib/config";
import { type Locale, getLocale, setLocale, t } from "../lib/i18n";
import { DEFAULT_PERSONA } from "../lib/persona";
import type { ProviderId } from "../lib/types";

const PROVIDERS: { id: ProviderId; label: string }[] = [
	{ id: "gemini", label: "Google Gemini" },
	{ id: "xai", label: "xAI (Grok)" },
	{ id: "anthropic", label: "Anthropic (Claude)" },
];

const TTS_VOICES: { id: string; label: string; price: string }[] = [
	{ id: "ko-KR-Wavenet-A", label: "여성 A (WaveNet)", price: "$16/1M자" },
	{ id: "ko-KR-Wavenet-B", label: "여성 B (WaveNet)", price: "$16/1M자" },
	{ id: "ko-KR-Wavenet-C", label: "남성 C (WaveNet)", price: "$16/1M자" },
	{ id: "ko-KR-Wavenet-D", label: "남성 D (WaveNet)", price: "$16/1M자" },
	{ id: "ko-KR-Neural2-A", label: "여성 A (Neural2)", price: "$16/1M자" },
	{ id: "ko-KR-Neural2-B", label: "여성 B (Neural2)", price: "$16/1M자" },
	{ id: "ko-KR-Neural2-C", label: "남성 C (Neural2)", price: "$16/1M자" },
	{ id: "ko-KR-Standard-A", label: "여성 A (Standard)", price: "$4/1M자" },
	{ id: "ko-KR-Standard-B", label: "여성 B (Standard)", price: "$4/1M자" },
	{ id: "ko-KR-Standard-C", label: "남성 C (Standard)", price: "$4/1M자" },
	{ id: "ko-KR-Standard-D", label: "남성 D (Standard)", price: "$4/1M자" },
];

const LOCALES: { id: Locale; label: string }[] = [
	{ id: "ko", label: "한국어" },
	{ id: "en", label: "English" },
];

const THEMES: { id: ThemeId; label: string; preview: string }[] = [
	{ id: "espresso", label: "Espresso", preview: "#3b2f2f" },
	{ id: "midnight", label: "Midnight", preview: "#1a1a2e" },
	{ id: "ocean", label: "Ocean", preview: "#1b2838" },
	{ id: "forest", label: "Forest", preview: "#1a2e1a" },
	{ id: "rose", label: "Rose", preview: "#2e1a2a" },
	{ id: "latte", label: "Latte", preview: "#f5f0e8" },
	{ id: "sakura", label: "Sakura", preview: "#fdf2f8" },
	{ id: "cloud", label: "Cloud", preview: "#f8f9fa" },
];

interface Props {
	onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
	const existing = loadConfig();
	const [provider, setProvider] = useState<ProviderId>(
		existing?.provider ?? "gemini",
	);
	const [model, setModel] = useState(
		existing?.model ?? getDefaultModel("gemini"),
	);
	const [apiKey, setApiKey] = useState(existing?.apiKey ?? "");
	const [locale, setLocaleState] = useState<Locale>(
		existing?.locale ?? getLocale(),
	);
	const [theme, setTheme] = useState<ThemeId>(existing?.theme ?? "espresso");
	const [backgroundImage, setBackgroundImage] = useState(
		existing?.backgroundImage ?? "",
	);
	const [ttsVoice, setTtsVoice] = useState(
		existing?.ttsVoice ?? "ko-KR-Wavenet-A",
	);
	const [googleApiKey, setGoogleApiKey] = useState(
		existing?.googleApiKey ?? "",
	);
	const [persona, setPersona] = useState(existing?.persona ?? DEFAULT_PERSONA);
	const [error, setError] = useState("");

	function handleProviderChange(id: ProviderId) {
		setProvider(id);
		setModel(getDefaultModel(id));
	}

	function handleLocaleChange(id: Locale) {
		setLocaleState(id);
		setLocale(id);
	}

	function handleThemeChange(id: ThemeId) {
		setTheme(id);
		// Live preview
		document.documentElement.setAttribute("data-theme", id);
	}

	function handleReset() {
		if (!window.confirm(t("settings.resetConfirm"))) return;
		localStorage.removeItem("cafelua-config");
		localStorage.removeItem("cafelua-camera");
		invoke("reset_window_state").catch(() => {});
		setLocale("ko");
		document.documentElement.setAttribute("data-theme", "espresso");
		window.location.reload();
	}

	function handleSave() {
		if (!apiKey.trim()) {
			setError(t("settings.apiKeyRequired"));
			return;
		}
		saveConfig({
			provider,
			model,
			apiKey: apiKey.trim(),
			locale,
			theme,
			backgroundImage: backgroundImage || undefined,
			ttsVoice,
			googleApiKey: googleApiKey.trim() || undefined,
			persona:
				persona.trim() !== DEFAULT_PERSONA.trim() ? persona.trim() : undefined,
		});
		setLocale(locale);
		onClose();
	}

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="settings-modal" onClick={(e) => e.stopPropagation()}>
				<h2>{t("settings.title")}</h2>

				<div className="settings-field">
					<label htmlFor="locale-select">{t("settings.language")}</label>
					<select
						id="locale-select"
						value={locale}
						onChange={(e) => handleLocaleChange(e.target.value as Locale)}
					>
						{LOCALES.map((l) => (
							<option key={l.id} value={l.id}>
								{l.label}
							</option>
						))}
					</select>
				</div>

				<div className="settings-field">
					<label>{t("settings.theme")}</label>
					<div className="theme-picker">
						{THEMES.map((th) => (
							<button
								key={th.id}
								type="button"
								className={`theme-swatch ${theme === th.id ? "active" : ""}`}
								style={{ background: th.preview }}
								onClick={() => handleThemeChange(th.id)}
								title={th.label}
							/>
						))}
					</div>
				</div>

				<div className="settings-section-divider">
					<span>{t("settings.personaSection")}</span>
				</div>

				<div className="settings-field">
					<label htmlFor="persona-input">{t("settings.persona")}</label>
					<textarea
						id="persona-input"
						className="settings-persona-textarea"
						value={persona}
						onChange={(e) => setPersona(e.target.value)}
						rows={6}
					/>
					<div className="settings-hint">{t("settings.personaHint")}</div>
				</div>

				<div className="settings-section-divider">
					<span>{t("settings.provider")}</span>
				</div>

				<div className="settings-field">
					<label htmlFor="provider-select">{t("settings.provider")}</label>
					<select
						id="provider-select"
						value={provider}
						onChange={(e) => handleProviderChange(e.target.value as ProviderId)}
					>
						{PROVIDERS.map((p) => (
							<option key={p.id} value={p.id}>
								{p.label}
							</option>
						))}
					</select>
				</div>

				<div className="settings-field">
					<label htmlFor="model-input">{t("settings.model")}</label>
					<input
						id="model-input"
						type="text"
						value={model}
						onChange={(e) => setModel(e.target.value)}
					/>
				</div>

				<div className="settings-field">
					<label htmlFor="apikey-input">{t("settings.apiKey")}</label>
					<input
						id="apikey-input"
						type="password"
						value={apiKey}
						onChange={(e) => {
							setApiKey(e.target.value);
							setError("");
						}}
						placeholder="sk-..."
					/>
					{error && <div className="settings-error">{error}</div>}
				</div>

				<div className="settings-section-divider">
					<span>{t("settings.voiceSection")}</span>
				</div>

				<div className="settings-field">
					<label htmlFor="google-apikey-input">
						{t("settings.googleApiKey")}
					</label>
					<input
						id="google-apikey-input"
						type="password"
						value={googleApiKey}
						onChange={(e) => setGoogleApiKey(e.target.value)}
						placeholder={
							provider === "gemini"
								? t("settings.googleApiKeyGeminiFallback")
								: "AIza..."
						}
					/>
				</div>

				<div className="settings-field">
					<label htmlFor="tts-voice-select">{t("settings.ttsVoice")}</label>
					<select
						id="tts-voice-select"
						value={ttsVoice}
						onChange={(e) => setTtsVoice(e.target.value)}
					>
						{TTS_VOICES.map((v) => (
							<option key={v.id} value={v.id}>
								{v.label} — {v.price}
							</option>
						))}
					</select>
				</div>

				<div className="settings-field">
					<label htmlFor="bg-input">{t("settings.background")}</label>
					<div className="background-picker">
						<input
							id="bg-input"
							type="text"
							value={backgroundImage}
							onChange={(e) => setBackgroundImage(e.target.value)}
							placeholder="/path/to/image.png"
						/>
						{backgroundImage && (
							<button
								type="button"
								className="bg-clear-btn"
								onClick={() => setBackgroundImage("")}
							>
								{t("settings.backgroundClear")}
							</button>
						)}
					</div>
				</div>

				<div className="settings-actions">
					<button
						type="button"
						className="settings-save-btn"
						onClick={handleSave}
					>
						{t("settings.save")}
					</button>
					<button
						type="button"
						className="settings-cancel-btn"
						onClick={onClose}
					>
						{t("settings.cancel")}
					</button>
				</div>

				<div className="settings-danger-zone">
					<button
						type="button"
						className="settings-reset-btn"
						onClick={handleReset}
					>
						{t("settings.reset")}
					</button>
				</div>
			</div>
		</div>
	);
}
