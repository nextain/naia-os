export type Locale = "ko" | "en" | "ja" | "zh" | "fr" | "de" | "ru" | "es" | "ar" | "hi" | "bn" | "pt" | "id" | "vi";

const translations = {
	// Settings
	"settings.title": { ko: "설정", en: "Settings", ja: "Settings", zh: "Settings", fr: "Settings", de: "Settings", ru: "Settings", es: "Settings", ar: "Settings", hi: "Settings", bn: "Settings", pt: "Settings", id: "Settings", vi: "Settings" },
	"settings.provider": { ko: "프로바이더", en: "Provider", ja: "Provider", zh: "Provider", fr: "Provider", de: "Provider", ru: "Provider", es: "Provider", ar: "Provider", hi: "Provider", bn: "Provider", pt: "Provider", id: "Provider", vi: "Provider" },
	"settings.aiSection": { ko: "AI 설정", en: "AI Settings", ja: "AI Settings", zh: "AI Settings", fr: "AI Settings", de: "AI Settings", ru: "AI Settings", es: "AI Settings", ar: "AI Settings", hi: "AI Settings", bn: "AI Settings", pt: "AI Settings", id: "AI Settings", vi: "AI Settings" },
	"settings.model": { ko: "모델", en: "Model", ja: "Model", zh: "Model", fr: "Model", de: "Model", ru: "Model", es: "Model", ar: "Model", hi: "Model", bn: "Model", pt: "Model", id: "Model", vi: "Model" },
	"settings.apiKey": { ko: "API 키", en: "API Key", ja: "API Key", zh: "API Key", fr: "API Key", de: "API Key", ru: "API Key", es: "API Key", ar: "API Key", hi: "API Key", bn: "API Key", pt: "API Key", id: "API Key", vi: "API Key" },
	"settings.apiKeyRequired": {
		ko: "API 키를 입력해주세요.",
		en: "Please enter an API key.", ja: "Please enter an API key.", zh: "Please enter an API key.", fr: "Please enter an API key.", de: "Please enter an API key.", ru: "Please enter an API key.", es: "Please enter an API key.", ar: "Please enter an API key.", hi: "Please enter an API key.", bn: "Please enter an API key.", pt: "Please enter an API key.", id: "Please enter an API key.", vi: "Please enter an API key.",
	},
	"settings.language": { ko: "언어", en: "Language", ja: "Language", zh: "Language", fr: "Language", de: "Language", ru: "Language", es: "Language", ar: "Language", hi: "Language", bn: "Language", pt: "Language", id: "Language", vi: "Language" },
	"settings.theme": { ko: "테마", en: "Theme", ja: "Theme", zh: "Theme", fr: "Theme", de: "Theme", ru: "Theme", es: "Theme", ar: "Theme", hi: "Theme", bn: "Theme", pt: "Theme", id: "Theme", vi: "Theme" },
	"settings.background": { ko: "배경 이미지", en: "Background Image", ja: "Background Image", zh: "Background Image", fr: "Background Image", de: "Background Image", ru: "Background Image", es: "Background Image", ar: "Background Image", hi: "Background Image", bn: "Background Image", pt: "Background Image", id: "Background Image", vi: "Background Image" },
	"settings.backgroundClear": { ko: "제거", en: "Clear", ja: "Clear", zh: "Clear", fr: "Clear", de: "Clear", ru: "Clear", es: "Clear", ar: "Clear", hi: "Clear", bn: "Clear", pt: "Clear", id: "Clear", vi: "Clear" },
	"settings.reset": { ko: "초기화", en: "Reset All", ja: "Reset All", zh: "Reset All", fr: "Reset All", de: "Reset All", ru: "Reset All", es: "Reset All", ar: "Reset All", hi: "Reset All", bn: "Reset All", pt: "Reset All", id: "Reset All", vi: "Reset All" },
	"settings.resetConfirm": {
		ko: "모든 설정과 카메라 위치를 초기화합니다.",
		en: "This will reset all settings and camera position.", ja: "This will reset all settings and camera position.", zh: "This will reset all settings and camera position.", fr: "This will reset all settings and camera position.", de: "This will reset all settings and camera position.", ru: "This will reset all settings and camera position.", es: "This will reset all settings and camera position.", ar: "This will reset all settings and camera position.", hi: "This will reset all settings and camera position.", bn: "This will reset all settings and camera position.", pt: "This will reset all settings and camera position.", id: "This will reset all settings and camera position.", vi: "This will reset all settings and camera position.",
	},
	"settings.resetClearHistory": {
		ko: "대화 기록도 함께 삭제",
		en: "Also delete chat history", ja: "Also delete chat history", zh: "Also delete chat history", fr: "Also delete chat history", de: "Also delete chat history", ru: "Also delete chat history", es: "Also delete chat history", ar: "Also delete chat history", hi: "Also delete chat history", bn: "Also delete chat history", pt: "Also delete chat history", id: "Also delete chat history", vi: "Also delete chat history",
	},
	"settings.resetExecute": {
		ko: "초기화 실행",
		en: "Execute Reset", ja: "Execute Reset", zh: "Execute Reset", fr: "Execute Reset", de: "Execute Reset", ru: "Execute Reset", es: "Execute Reset", ar: "Execute Reset", hi: "Execute Reset", bn: "Execute Reset", pt: "Execute Reset", id: "Execute Reset", vi: "Execute Reset",
	},
	"settings.save": { ko: "저장", en: "Save", ja: "Save", zh: "Save", fr: "Save", de: "Save", ru: "Save", es: "Save", ar: "Save", hi: "Save", bn: "Save", pt: "Save", id: "Save", vi: "Save" },
	"settings.cancel": { ko: "취소", en: "Cancel", ja: "Cancel", zh: "Cancel", fr: "Cancel", de: "Cancel", ru: "Cancel", es: "Cancel", ar: "Cancel", hi: "Cancel", bn: "Cancel", pt: "Cancel", id: "Cancel", vi: "Cancel" },

	// Chat
	"chat.placeholder": {
		ko: "메시지를 입력하세요...",
		en: "Type a message...", ja: "Type a message...", zh: "Type a message...", fr: "Type a message...", de: "Type a message...", ru: "Type a message...", es: "Type a message...", ar: "Type a message...", hi: "Type a message...", bn: "Type a message...", pt: "Type a message...", id: "Type a message...", vi: "Type a message...",
	},
	"chat.noApiKey": {
		ko: "API 키가 설정되지 않았습니다. 설정에서 API 키를 입력해주세요.",
		en: "No API key configured. Please enter your API key in settings.", ja: "No API key configured. Please enter your API key in settings.", zh: "No API key configured. Please enter your API key in settings.", fr: "No API key configured. Please enter your API key in settings.", de: "No API key configured. Please enter your API key in settings.", ru: "No API key configured. Please enter your API key in settings.", es: "No API key configured. Please enter your API key in settings.", ar: "No API key configured. Please enter your API key in settings.", hi: "No API key configured. Please enter your API key in settings.", bn: "No API key configured. Please enter your API key in settings.", pt: "No API key configured. Please enter your API key in settings.", id: "No API key configured. Please enter your API key in settings.", vi: "No API key configured. Please enter your API key in settings.",
	},
	"chat.error": { ko: "오류", en: "Error", ja: "Error", zh: "Error", fr: "Error", de: "Error", ru: "Error", es: "Error", ar: "Error", hi: "Error", bn: "Error", pt: "Error", id: "Error", vi: "Error" },
	"chat.settings": { ko: "설정", en: "Settings", ja: "Settings", zh: "Settings", fr: "Settings", de: "Settings", ru: "Settings", es: "Settings", ar: "Settings", hi: "Settings", bn: "Settings", pt: "Settings", id: "Settings", vi: "Settings" },
	"chat.tokens": { ko: "토큰", en: "tokens", ja: "tokens", zh: "tokens", fr: "tokens", de: "tokens", ru: "tokens", es: "tokens", ar: "tokens", hi: "tokens", bn: "tokens", pt: "tokens", id: "tokens", vi: "tokens" },
	"settings.voiceSection": { ko: "음성 (TTS/STT)", en: "Voice (TTS/STT)", ja: "Voice (TTS/STT)", zh: "Voice (TTS/STT)", fr: "Voice (TTS/STT)", de: "Voice (TTS/STT)", ru: "Voice (TTS/STT)", es: "Voice (TTS/STT)", ar: "Voice (TTS/STT)", hi: "Voice (TTS/STT)", bn: "Voice (TTS/STT)", pt: "Voice (TTS/STT)", id: "Voice (TTS/STT)", vi: "Voice (TTS/STT)" },
	"settings.googleApiKey": {
		ko: "Google API 키 (TTS/STT용)",
		en: "Google API Key (for TTS/STT)", ja: "Google API Key (for TTS/STT)", zh: "Google API Key (for TTS/STT)", fr: "Google API Key (for TTS/STT)", de: "Google API Key (for TTS/STT)", ru: "Google API Key (for TTS/STT)", es: "Google API Key (for TTS/STT)", ar: "Google API Key (for TTS/STT)", hi: "Google API Key (for TTS/STT)", bn: "Google API Key (for TTS/STT)", pt: "Google API Key (for TTS/STT)", id: "Google API Key (for TTS/STT)", vi: "Google API Key (for TTS/STT)",
	},
	"settings.googleApiKeyGeminiFallback": {
		ko: "비워두면 대화용 키 사용",
		en: "Leave empty to use chat key", ja: "Leave empty to use chat key", zh: "Leave empty to use chat key", fr: "Leave empty to use chat key", de: "Leave empty to use chat key", ru: "Leave empty to use chat key", es: "Leave empty to use chat key", ar: "Leave empty to use chat key", hi: "Leave empty to use chat key", bn: "Leave empty to use chat key", pt: "Leave empty to use chat key", id: "Leave empty to use chat key", vi: "Leave empty to use chat key",
	},
	"settings.personaSection": { ko: "페르소나", en: "Persona", ja: "Persona", zh: "Persona", fr: "Persona", de: "Persona", ru: "Persona", es: "Persona", ar: "Persona", hi: "Persona", bn: "Persona", pt: "Persona", id: "Persona", vi: "Persona" },
	"settings.persona": {
		ko: "Naia 성격 설정",
		en: "Naia Personality", ja: "Naia Personality", zh: "Naia Personality", fr: "Naia Personality", de: "Naia Personality", ru: "Naia Personality", es: "Naia Personality", ar: "Naia Personality", hi: "Naia Personality", bn: "Naia Personality", pt: "Naia Personality", id: "Naia Personality", vi: "Naia Personality",
	},
	"settings.personaHint": {
		ko: "이름, 성격, 말투, 행동 등을 자유롭게 설정하세요. 감정 태그는 자동 추가됩니다.",
		en: "Customize name, personality, speech style, behavior. Emotion tags are added automatically.", ja: "Customize name, personality, speech style, behavior. Emotion tags are added automatically.", zh: "Customize name, personality, speech style, behavior. Emotion tags are added automatically.", fr: "Customize name, personality, speech style, behavior. Emotion tags are added automatically.", de: "Customize name, personality, speech style, behavior. Emotion tags are added automatically.", ru: "Customize name, personality, speech style, behavior. Emotion tags are added automatically.", es: "Customize name, personality, speech style, behavior. Emotion tags are added automatically.", ar: "Customize name, personality, speech style, behavior. Emotion tags are added automatically.", hi: "Customize name, personality, speech style, behavior. Emotion tags are added automatically.", bn: "Customize name, personality, speech style, behavior. Emotion tags are added automatically.", pt: "Customize name, personality, speech style, behavior. Emotion tags are added automatically.", id: "Customize name, personality, speech style, behavior. Emotion tags are added automatically.", vi: "Customize name, personality, speech style, behavior. Emotion tags are added automatically.",
	},
	"settings.ttsEnabled": { ko: "음성 응답 (TTS)", en: "Voice Response (TTS)", ja: "Voice Response (TTS)", zh: "Voice Response (TTS)", fr: "Voice Response (TTS)", de: "Voice Response (TTS)", ru: "Voice Response (TTS)", es: "Voice Response (TTS)", ar: "Voice Response (TTS)", hi: "Voice Response (TTS)", bn: "Voice Response (TTS)", pt: "Voice Response (TTS)", id: "Voice Response (TTS)", vi: "Voice Response (TTS)" },
	"settings.sttEnabled": { ko: "음성 입력 (STT)", en: "Voice Input (STT)", ja: "Voice Input (STT)", zh: "Voice Input (STT)", fr: "Voice Input (STT)", de: "Voice Input (STT)", ru: "Voice Input (STT)", es: "Voice Input (STT)", ar: "Voice Input (STT)", hi: "Voice Input (STT)", bn: "Voice Input (STT)", pt: "Voice Input (STT)", id: "Voice Input (STT)", vi: "Voice Input (STT)" },
	"settings.ttsVoice": { ko: "TTS 음성", en: "TTS Voice", ja: "TTS Voice", zh: "TTS Voice", fr: "TTS Voice", de: "TTS Voice", ru: "TTS Voice", es: "TTS Voice", ar: "TTS Voice", hi: "TTS Voice", bn: "TTS Voice", pt: "TTS Voice", id: "TTS Voice", vi: "TTS Voice" },
	"settings.voicePreview": { ko: "미리 듣기", en: "Preview", ja: "Preview", zh: "Preview", fr: "Preview", de: "Preview", ru: "Preview", es: "Preview", ar: "Preview", hi: "Preview", bn: "Preview", pt: "Preview", id: "Preview", vi: "Preview" },
	"settings.voicePreviewing": { ko: "재생 중...", en: "Playing...", ja: "Playing...", zh: "Playing...", fr: "Playing...", de: "Playing...", ru: "Playing...", es: "Playing...", ar: "Playing...", hi: "Playing...", bn: "Playing...", pt: "Playing...", id: "Playing...", vi: "Playing..." },
	"chat.recording": { ko: "녹음 중...", en: "Recording...", ja: "Recording...", zh: "Recording...", fr: "Recording...", de: "Recording...", ru: "Recording...", es: "Recording...", ar: "Recording...", hi: "Recording...", bn: "Recording...", pt: "Recording...", id: "Recording...", vi: "Recording..." },
	"chat.micError": {
		ko: "마이크를 사용할 수 없습니다.",
		en: "Microphone is not available.", ja: "Microphone is not available.", zh: "Microphone is not available.", fr: "Microphone is not available.", de: "Microphone is not available.", ru: "Microphone is not available.", es: "Microphone is not available.", ar: "Microphone is not available.", hi: "Microphone is not available.", bn: "Microphone is not available.", pt: "Microphone is not available.", id: "Microphone is not available.", vi: "Microphone is not available.",
	},

	// Tools
	"tool.execute_command": { ko: "명령 실행", en: "Execute Command", ja: "Execute Command", zh: "Execute Command", fr: "Execute Command", de: "Execute Command", ru: "Execute Command", es: "Execute Command", ar: "Execute Command", hi: "Execute Command", bn: "Execute Command", pt: "Execute Command", id: "Execute Command", vi: "Execute Command" },
	"tool.read_file": { ko: "파일 읽기", en: "Read File", ja: "Read File", zh: "Read File", fr: "Read File", de: "Read File", ru: "Read File", es: "Read File", ar: "Read File", hi: "Read File", bn: "Read File", pt: "Read File", id: "Read File", vi: "Read File" },
	"tool.write_file": { ko: "파일 쓰기", en: "Write File", ja: "Write File", zh: "Write File", fr: "Write File", de: "Write File", ru: "Write File", es: "Write File", ar: "Write File", hi: "Write File", bn: "Write File", pt: "Write File", id: "Write File", vi: "Write File" },
	"tool.search_files": { ko: "파일 검색", en: "Search Files", ja: "Search Files", zh: "Search Files", fr: "Search Files", de: "Search Files", ru: "Search Files", es: "Search Files", ar: "Search Files", hi: "Search Files", bn: "Search Files", pt: "Search Files", id: "Search Files", vi: "Search Files" },
	"tool.web_search": { ko: "웹 검색", en: "Web Search", ja: "Web Search", zh: "Web Search", fr: "Web Search", de: "Web Search", ru: "Web Search", es: "Web Search", ar: "Web Search", hi: "Web Search", bn: "Web Search", pt: "Web Search", id: "Web Search", vi: "Web Search" },
	"tool.apply_diff": { ko: "파일 편집", en: "Apply Diff", ja: "Apply Diff", zh: "Apply Diff", fr: "Apply Diff", de: "Apply Diff", ru: "Apply Diff", es: "Apply Diff", ar: "Apply Diff", hi: "Apply Diff", bn: "Apply Diff", pt: "Apply Diff", id: "Apply Diff", vi: "Apply Diff" },
	"tool.browser": { ko: "웹 페이지", en: "Browser", ja: "Browser", zh: "Browser", fr: "Browser", de: "Browser", ru: "Browser", es: "Browser", ar: "Browser", hi: "Browser", bn: "Browser", pt: "Browser", id: "Browser", vi: "Browser" },
	"tool.sessions_spawn": { ko: "서브 에이전트", en: "Sub-agent", ja: "Sub-agent", zh: "Sub-agent", fr: "Sub-agent", de: "Sub-agent", ru: "Sub-agent", es: "Sub-agent", ar: "Sub-agent", hi: "Sub-agent", bn: "Sub-agent", pt: "Sub-agent", id: "Sub-agent", vi: "Sub-agent" },
	"tool.unknown": { ko: "도구 실행", en: "Tool Execution", ja: "Tool Execution", zh: "Tool Execution", fr: "Tool Execution", de: "Tool Execution", ru: "Tool Execution", es: "Tool Execution", ar: "Tool Execution", hi: "Tool Execution", bn: "Tool Execution", pt: "Tool Execution", id: "Tool Execution", vi: "Tool Execution" },
	"settings.toolsSection": { ko: "도구 (Tools)", en: "Tools", ja: "Tools", zh: "Tools", fr: "Tools", de: "Tools", ru: "Tools", es: "Tools", ar: "Tools", hi: "Tools", bn: "Tools", pt: "Tools", id: "Tools", vi: "Tools" },
	"settings.enableTools": { ko: "도구 사용", en: "Enable Tools", ja: "Enable Tools", zh: "Enable Tools", fr: "Enable Tools", de: "Enable Tools", ru: "Enable Tools", es: "Enable Tools", ar: "Enable Tools", hi: "Enable Tools", bn: "Enable Tools", pt: "Enable Tools", id: "Enable Tools", vi: "Enable Tools" },
	"settings.gatewayUrl": { ko: "Gateway URL", en: "Gateway URL", ja: "Gateway URL", zh: "Gateway URL", fr: "Gateway URL", de: "Gateway URL", ru: "Gateway URL", es: "Gateway URL", ar: "Gateway URL", hi: "Gateway URL", bn: "Gateway URL", pt: "Gateway URL", id: "Gateway URL", vi: "Gateway URL" },
	"settings.gatewayToken": { ko: "Gateway 토큰", en: "Gateway Token", ja: "Gateway Token", zh: "Gateway Token", fr: "Gateway Token", de: "Gateway Token", ru: "Gateway Token", es: "Gateway Token", ar: "Gateway Token", hi: "Gateway Token", bn: "Gateway Token", pt: "Gateway Token", id: "Gateway Token", vi: "Gateway Token" },
	"settings.allowedTools": {
		ko: "허용된 도구",
		en: "Allowed Tools", ja: "Allowed Tools", zh: "Allowed Tools", fr: "Allowed Tools", de: "Allowed Tools", ru: "Allowed Tools", es: "Allowed Tools", ar: "Allowed Tools", hi: "Allowed Tools", bn: "Allowed Tools", pt: "Allowed Tools", id: "Allowed Tools", vi: "Allowed Tools",
	},
	"settings.clearAllowedTools": {
		ko: "허용 목록 초기화",
		en: "Clear Allowed Tools", ja: "Clear Allowed Tools", zh: "Clear Allowed Tools", fr: "Clear Allowed Tools", de: "Clear Allowed Tools", ru: "Clear Allowed Tools", es: "Clear Allowed Tools", ar: "Clear Allowed Tools", hi: "Clear Allowed Tools", bn: "Clear Allowed Tools", pt: "Clear Allowed Tools", id: "Clear Allowed Tools", vi: "Clear Allowed Tools",
	},

	// Permission modal
	"permission.title": {
		ko: "도구 실행 승인",
		en: "Tool Execution Approval", ja: "Tool Execution Approval", zh: "Tool Execution Approval", fr: "Tool Execution Approval", de: "Tool Execution Approval", ru: "Tool Execution Approval", es: "Tool Execution Approval", ar: "Tool Execution Approval", hi: "Tool Execution Approval", bn: "Tool Execution Approval", pt: "Tool Execution Approval", id: "Tool Execution Approval", vi: "Tool Execution Approval",
	},
	"permission.allowOnce": { ko: "이번만 허용", en: "Allow Once", ja: "Allow Once", zh: "Allow Once", fr: "Allow Once", de: "Allow Once", ru: "Allow Once", es: "Allow Once", ar: "Allow Once", hi: "Allow Once", bn: "Allow Once", pt: "Allow Once", id: "Allow Once", vi: "Allow Once" },
	"permission.allowAlways": { ko: "항상 허용", en: "Always Allow", ja: "Always Allow", zh: "Always Allow", fr: "Always Allow", de: "Always Allow", ru: "Always Allow", es: "Always Allow", ar: "Always Allow", hi: "Always Allow", bn: "Always Allow", pt: "Always Allow", id: "Always Allow", vi: "Always Allow" },
	"permission.reject": { ko: "거부", en: "Reject", ja: "Reject", zh: "Reject", fr: "Reject", de: "Reject", ru: "Reject", es: "Reject", ar: "Reject", hi: "Reject", bn: "Reject", pt: "Reject", id: "Reject", vi: "Reject" },
	"permission.tier1": { ko: "알림", en: "Notice", ja: "Notice", zh: "Notice", fr: "Notice", de: "Notice", ru: "Notice", es: "Notice", ar: "Notice", hi: "Notice", bn: "Notice", pt: "Notice", id: "Notice", vi: "Notice" },
	"permission.tier2": { ko: "주의", en: "Caution", ja: "Caution", zh: "Caution", fr: "Caution", de: "Caution", ru: "Caution", es: "Caution", ar: "Caution", hi: "Caution", bn: "Caution", pt: "Caution", id: "Caution", vi: "Caution" },
	"permission.rejectReason": {
		ko: "사용자가 실행을 거부했습니다.",
		en: "User rejected execution.", ja: "User rejected execution.", zh: "User rejected execution.", fr: "User rejected execution.", de: "User rejected execution.", ru: "User rejected execution.", es: "User rejected execution.", ar: "User rejected execution.", hi: "User rejected execution.", bn: "User rejected execution.", pt: "User rejected execution.", id: "User rejected execution.", vi: "User rejected execution.",
	},
	"permission.timeout": {
		ko: "승인 시간이 초과되었습니다.",
		en: "Approval timed out.", ja: "Approval timed out.", zh: "Approval timed out.", fr: "Approval timed out.", de: "Approval timed out.", ru: "Approval timed out.", es: "Approval timed out.", ar: "Approval timed out.", hi: "Approval timed out.", bn: "Approval timed out.", pt: "Approval timed out.", id: "Approval timed out.", vi: "Approval timed out.",
	},

	// Work Progress
	"progress.title": { ko: "작업 현황", en: "Work Progress", ja: "Work Progress", zh: "Work Progress", fr: "Work Progress", de: "Work Progress", ru: "Work Progress", es: "Work Progress", ar: "Work Progress", hi: "Work Progress", bn: "Work Progress", pt: "Work Progress", id: "Work Progress", vi: "Work Progress" },
	"progress.loading": { ko: "로딩 중...", en: "Loading...", ja: "Loading...", zh: "Loading...", fr: "Loading...", de: "Loading...", ru: "Loading...", es: "Loading...", ar: "Loading...", hi: "Loading...", bn: "Loading...", pt: "Loading...", id: "Loading...", vi: "Loading..." },
	"progress.empty": {
		ko: "기록이 없습니다. 대화를 시작하면 여기에 표시됩니다.",
		en: "No events yet. Start a conversation to see progress here.", ja: "No events yet. Start a conversation to see progress here.", zh: "No events yet. Start a conversation to see progress here.", fr: "No events yet. Start a conversation to see progress here.", de: "No events yet. Start a conversation to see progress here.", ru: "No events yet. Start a conversation to see progress here.", es: "No events yet. Start a conversation to see progress here.", ar: "No events yet. Start a conversation to see progress here.", hi: "No events yet. Start a conversation to see progress here.", bn: "No events yet. Start a conversation to see progress here.", pt: "No events yet. Start a conversation to see progress here.", id: "No events yet. Start a conversation to see progress here.", vi: "No events yet. Start a conversation to see progress here.",
	},
	"progress.refresh": { ko: "새로고침", en: "Refresh", ja: "Refresh", zh: "Refresh", fr: "Refresh", de: "Refresh", ru: "Refresh", es: "Refresh", ar: "Refresh", hi: "Refresh", bn: "Refresh", pt: "Refresh", id: "Refresh", vi: "Refresh" },
	"progress.totalEvents": { ko: "총 이벤트", en: "Total Events", ja: "Total Events", zh: "Total Events", fr: "Total Events", de: "Total Events", ru: "Total Events", es: "Total Events", ar: "Total Events", hi: "Total Events", bn: "Total Events", pt: "Total Events", id: "Total Events", vi: "Total Events" },
	"progress.totalCost": { ko: "총 비용", en: "Total Cost", ja: "Total Cost", zh: "Total Cost", fr: "Total Cost", de: "Total Cost", ru: "Total Cost", es: "Total Cost", ar: "Total Cost", hi: "Total Cost", bn: "Total Cost", pt: "Total Cost", id: "Total Cost", vi: "Total Cost" },
	"progress.toolCount": { ko: "도구 수", en: "Tools Used", ja: "Tools Used", zh: "Tools Used", fr: "Tools Used", de: "Tools Used", ru: "Tools Used", es: "Tools Used", ar: "Tools Used", hi: "Tools Used", bn: "Tools Used", pt: "Tools Used", id: "Tools Used", vi: "Tools Used" },
	"progress.errorCount": { ko: "에러 수", en: "Errors", ja: "Errors", zh: "Errors", fr: "Errors", de: "Errors", ru: "Errors", es: "Errors", ar: "Errors", hi: "Errors", bn: "Errors", pt: "Errors", id: "Errors", vi: "Errors" },
	"progress.tabChat": { ko: "채팅", en: "Chat", ja: "Chat", zh: "Chat", fr: "Chat", de: "Chat", ru: "Chat", es: "Chat", ar: "Chat", hi: "Chat", bn: "Chat", pt: "Chat", id: "Chat", vi: "Chat" },
	"progress.tabProgress": { ko: "작업", en: "Progress", ja: "Progress", zh: "Progress", fr: "Progress", de: "Progress", ru: "Progress", es: "Progress", ar: "Progress", hi: "Progress", bn: "Progress", pt: "Progress", id: "Progress", vi: "Progress" },

	// Memory
	"chat.newConversation": { ko: "새 대화", en: "New Chat", ja: "New Chat", zh: "New Chat", fr: "New Chat", de: "New Chat", ru: "New Chat", es: "New Chat", ar: "New Chat", hi: "New Chat", bn: "New Chat", pt: "New Chat", id: "New Chat", vi: "New Chat" },

	// Settings tab
	"settings.saved": { ko: "저장됨!", en: "Saved!", ja: "Saved!", zh: "Saved!", fr: "Saved!", de: "Saved!", ru: "Saved!", es: "Saved!", ar: "Saved!", hi: "Saved!", bn: "Saved!", pt: "Saved!", id: "Saved!", vi: "Saved!" },

	// Skills Tab
	"skills.tabSkills": { ko: "스킬", en: "Skills", ja: "Skills", zh: "Skills", fr: "Skills", de: "Skills", ru: "Skills", es: "Skills", ar: "Skills", hi: "Skills", bn: "Skills", pt: "Skills", id: "Skills", vi: "Skills" },
	"skills.loading": { ko: "스킬 로딩 중...", en: "Loading skills...", ja: "Loading skills...", zh: "Loading skills...", fr: "Loading skills...", de: "Loading skills...", ru: "Loading skills...", es: "Loading skills...", ar: "Loading skills...", hi: "Loading skills...", bn: "Loading skills...", pt: "Loading skills...", id: "Loading skills...", vi: "Loading skills..." },
	"skills.empty": {
		ko: "등록된 스킬이 없습니다.",
		en: "No skills registered.", ja: "No skills registered.", zh: "No skills registered.", fr: "No skills registered.", de: "No skills registered.", ru: "No skills registered.", es: "No skills registered.", ar: "No skills registered.", hi: "No skills registered.", bn: "No skills registered.", pt: "No skills registered.", id: "No skills registered.", vi: "No skills registered.",
	},
	"skills.enabled": { ko: "활성", en: "Enabled", ja: "Enabled", zh: "Enabled", fr: "Enabled", de: "Enabled", ru: "Enabled", es: "Enabled", ar: "Enabled", hi: "Enabled", bn: "Enabled", pt: "Enabled", id: "Enabled", vi: "Enabled" },
	"skills.disabled": { ko: "비활성", en: "Disabled", ja: "Disabled", zh: "Disabled", fr: "Disabled", de: "Disabled", ru: "Disabled", es: "Disabled", ar: "Disabled", hi: "Disabled", bn: "Disabled", pt: "Disabled", id: "Disabled", vi: "Disabled" },
	"skills.builtIn": { ko: "기본", en: "Built-in", ja: "Built-in", zh: "Built-in", fr: "Built-in", de: "Built-in", ru: "Built-in", es: "Built-in", ar: "Built-in", hi: "Built-in", bn: "Built-in", pt: "Built-in", id: "Built-in", vi: "Built-in" },
	"skills.custom": { ko: "커스텀", en: "Custom", ja: "Custom", zh: "Custom", fr: "Custom", de: "Custom", ru: "Custom", es: "Custom", ar: "Custom", hi: "Custom", bn: "Custom", pt: "Custom", id: "Custom", vi: "Custom" },
	"skills.gateway": { ko: "게이트웨이", en: "Gateway", ja: "Gateway", zh: "Gateway", fr: "Gateway", de: "Gateway", ru: "Gateway", es: "Gateway", ar: "Gateway", hi: "Gateway", bn: "Gateway", pt: "Gateway", id: "Gateway", vi: "Gateway" },
	"skills.command": { ko: "명령", en: "Command", ja: "Command", zh: "Command", fr: "Command", de: "Command", ru: "Command", es: "Command", ar: "Command", hi: "Command", bn: "Command", pt: "Command", id: "Command", vi: "Command" },
	"skills.search": { ko: "스킬 검색...", en: "Search skills...", ja: "Search skills...", zh: "Search skills...", fr: "Search skills...", de: "Search skills...", ru: "Search skills...", es: "Search skills...", ar: "Search skills...", hi: "Search skills...", bn: "Search skills...", pt: "Search skills...", id: "Search skills...", vi: "Search skills..." },
	"skills.enableAll": { ko: "전체 활성", en: "Enable All", ja: "Enable All", zh: "Enable All", fr: "Enable All", de: "Enable All", ru: "Enable All", es: "Enable All", ar: "Enable All", hi: "Enable All", bn: "Enable All", pt: "Enable All", id: "Enable All", vi: "Enable All" },
	"skills.disableAll": { ko: "전체 비활성", en: "Disable All", ja: "Disable All", zh: "Disable All", fr: "Disable All", de: "Disable All", ru: "Disable All", es: "Disable All", ar: "Disable All", hi: "Disable All", bn: "Disable All", pt: "Disable All", id: "Disable All", vi: "Disable All" },
	"skills.builtInSection": { ko: "기본 스킬", en: "Built-in Skills", ja: "Built-in Skills", zh: "Built-in Skills", fr: "Built-in Skills", de: "Built-in Skills", ru: "Built-in Skills", es: "Built-in Skills", ar: "Built-in Skills", hi: "Built-in Skills", bn: "Built-in Skills", pt: "Built-in Skills", id: "Built-in Skills", vi: "Built-in Skills" },
	"skills.customSection": { ko: "커스텀 스킬", en: "Custom Skills", ja: "Custom Skills", zh: "Custom Skills", fr: "Custom Skills", de: "Custom Skills", ru: "Custom Skills", es: "Custom Skills", ar: "Custom Skills", hi: "Custom Skills", bn: "Custom Skills", pt: "Custom Skills", id: "Custom Skills", vi: "Custom Skills" },
	"skills.askAI": {
		ko: "AI에게 이 스킬에 대해 질문하기",
		en: "Ask AI about this skill", ja: "Ask AI about this skill", zh: "Ask AI about this skill", fr: "Ask AI about this skill", de: "Ask AI about this skill", ru: "Ask AI about this skill", es: "Ask AI about this skill", ar: "Ask AI about this skill", hi: "Ask AI about this skill", bn: "Ask AI about this skill", pt: "Ask AI about this skill", id: "Ask AI about this skill", vi: "Ask AI about this skill",
	},
	"skills.gatewayStatusSection": {
		ko: "Gateway 스킬 상태",
		en: "Gateway Skills Status", ja: "Gateway Skills Status", zh: "Gateway Skills Status", fr: "Gateway Skills Status", de: "Gateway Skills Status", ru: "Gateway Skills Status", es: "Gateway Skills Status", ar: "Gateway Skills Status", hi: "Gateway Skills Status", bn: "Gateway Skills Status", pt: "Gateway Skills Status", id: "Gateway Skills Status", vi: "Gateway Skills Status",
	},
	"skills.eligible": { ko: "사용 가능", en: "Eligible", ja: "Eligible", zh: "Eligible", fr: "Eligible", de: "Eligible", ru: "Eligible", es: "Eligible", ar: "Eligible", hi: "Eligible", bn: "Eligible", pt: "Eligible", id: "Eligible", vi: "Eligible" },
	"skills.install": { ko: "설치", en: "Install", ja: "Install", zh: "Install", fr: "Install", de: "Install", ru: "Install", es: "Install", ar: "Install", hi: "Install", bn: "Install", pt: "Install", id: "Install", vi: "Install" },
	"skills.installing": { ko: "설치 중...", en: "Installing...", ja: "Installing...", zh: "Installing...", fr: "Installing...", de: "Installing...", ru: "Installing...", es: "Installing...", ar: "Installing...", hi: "Installing...", bn: "Installing...", pt: "Installing...", id: "Installing...", vi: "Installing..." },
	"skills.missing": { ko: "필요 항목", en: "Missing", ja: "Missing", zh: "Missing", fr: "Missing", de: "Missing", ru: "Missing", es: "Missing", ar: "Missing", hi: "Missing", bn: "Missing", pt: "Missing", id: "Missing", vi: "Missing" },
	"skills.gatewayLoading": {
		ko: "Gateway 스킬 로딩 중...",
		en: "Loading Gateway skills...", ja: "Loading Gateway skills...", zh: "Loading Gateway skills...", fr: "Loading Gateway skills...", de: "Loading Gateway skills...", ru: "Loading Gateway skills...", es: "Loading Gateway skills...", ar: "Loading Gateway skills...", hi: "Loading Gateway skills...", bn: "Loading Gateway skills...", pt: "Loading Gateway skills...", id: "Loading Gateway skills...", vi: "Loading Gateway skills...",
	},

	// Cost Dashboard (4.4-ui)
	"cost.title": { ko: "비용 상세", en: "Cost Details", ja: "Cost Details", zh: "Cost Details", fr: "Cost Details", de: "Cost Details", ru: "Cost Details", es: "Cost Details", ar: "Cost Details", hi: "Cost Details", bn: "Cost Details", pt: "Cost Details", id: "Cost Details", vi: "Cost Details" },
	"cost.provider": { ko: "프로바이더", en: "Provider", ja: "Provider", zh: "Provider", fr: "Provider", de: "Provider", ru: "Provider", es: "Provider", ar: "Provider", hi: "Provider", bn: "Provider", pt: "Provider", id: "Provider", vi: "Provider" },
	"cost.model": { ko: "모델", en: "Model", ja: "Model", zh: "Model", fr: "Model", de: "Model", ru: "Model", es: "Model", ar: "Model", hi: "Model", bn: "Model", pt: "Model", id: "Model", vi: "Model" },
	"cost.messages": { ko: "메시지", en: "Messages", ja: "Messages", zh: "Messages", fr: "Messages", de: "Messages", ru: "Messages", es: "Messages", ar: "Messages", hi: "Messages", bn: "Messages", pt: "Messages", id: "Messages", vi: "Messages" },
	"cost.inputTokens": { ko: "입력 토큰", en: "Input Tokens", ja: "Input Tokens", zh: "Input Tokens", fr: "Input Tokens", de: "Input Tokens", ru: "Input Tokens", es: "Input Tokens", ar: "Input Tokens", hi: "Input Tokens", bn: "Input Tokens", pt: "Input Tokens", id: "Input Tokens", vi: "Input Tokens" },
	"cost.outputTokens": { ko: "출력 토큰", en: "Output Tokens", ja: "Output Tokens", zh: "Output Tokens", fr: "Output Tokens", de: "Output Tokens", ru: "Output Tokens", es: "Output Tokens", ar: "Output Tokens", hi: "Output Tokens", bn: "Output Tokens", pt: "Output Tokens", id: "Output Tokens", vi: "Output Tokens" },
	"cost.total": { ko: "합계", en: "Total", ja: "Total", zh: "Total", fr: "Total", de: "Total", ru: "Total", es: "Total", ar: "Total", hi: "Total", bn: "Total", pt: "Total", id: "Total", vi: "Total" },
	"cost.empty": { ko: "비용 데이터가 없습니다.", en: "No cost data.", ja: "No cost data.", zh: "No cost data.", fr: "No cost data.", de: "No cost data.", ru: "No cost data.", es: "No cost data.", ar: "No cost data.", hi: "No cost data.", bn: "No cost data.", pt: "No cost data.", id: "No cost data.", vi: "No cost data." },

	// History Tab (4.4-ui)
	"history.title": { ko: "대화 기록", en: "History", ja: "History", zh: "History", fr: "History", de: "History", ru: "History", es: "History", ar: "History", hi: "History", bn: "History", pt: "History", id: "History", vi: "History" },
	"history.empty": {
		ko: "대화 기록이 없습니다.",
		en: "No conversation history.", ja: "No conversation history.", zh: "No conversation history.", fr: "No conversation history.", de: "No conversation history.", ru: "No conversation history.", es: "No conversation history.", ar: "No conversation history.", hi: "No conversation history.", bn: "No conversation history.", pt: "No conversation history.", id: "No conversation history.", vi: "No conversation history.",
	},
	"history.untitled": { ko: "제목 없음", en: "Untitled", ja: "Untitled", zh: "Untitled", fr: "Untitled", de: "Untitled", ru: "Untitled", es: "Untitled", ar: "Untitled", hi: "Untitled", bn: "Untitled", pt: "Untitled", id: "Untitled", vi: "Untitled" },
	"history.messages": { ko: "메시지", en: "messages", ja: "messages", zh: "messages", fr: "messages", de: "messages", ru: "messages", es: "messages", ar: "messages", hi: "messages", bn: "messages", pt: "messages", id: "messages", vi: "messages" },
	"history.delete": { ko: "삭제", en: "Delete", ja: "Delete", zh: "Delete", fr: "Delete", de: "Delete", ru: "Delete", es: "Delete", ar: "Delete", hi: "Delete", bn: "Delete", pt: "Delete", id: "Delete", vi: "Delete" },
	"history.deleteConfirm": {
		ko: "이 대화를 삭제하시겠습니까?",
		en: "Delete this conversation?", ja: "Delete this conversation?", zh: "Delete this conversation?", fr: "Delete this conversation?", de: "Delete this conversation?", ru: "Delete this conversation?", es: "Delete this conversation?", ar: "Delete this conversation?", hi: "Delete this conversation?", bn: "Delete this conversation?", pt: "Delete this conversation?", id: "Delete this conversation?", vi: "Delete this conversation?",
	},
	"history.current": { ko: "현재", en: "Current", ja: "Current", zh: "Current", fr: "Current", de: "Current", ru: "Current", es: "Current", ar: "Current", hi: "Current", bn: "Current", pt: "Current", id: "Current", vi: "Current" },
	"history.tabHistory": { ko: "기록", en: "History", ja: "History", zh: "History", fr: "History", de: "History", ru: "History", es: "History", ar: "History", hi: "History", bn: "History", pt: "History", id: "History", vi: "History" },

	// Progress filter (4.4-ui)
	"progress.showAll": { ko: "전체 보기", en: "Show All", ja: "Show All", zh: "Show All", fr: "Show All", de: "Show All", ru: "Show All", es: "Show All", ar: "Show All", hi: "Show All", bn: "Show All", pt: "Show All", id: "Show All", vi: "Show All" },
	"progress.filteredErrors": {
		ko: "에러만 표시 중",
		en: "Showing errors only", ja: "Showing errors only", zh: "Showing errors only", fr: "Showing errors only", de: "Showing errors only", ru: "Showing errors only", es: "Showing errors only", ar: "Showing errors only", hi: "Showing errors only", bn: "Showing errors only", pt: "Showing errors only", id: "Showing errors only", vi: "Showing errors only",
	},

	// Message queue (4.4-ui)
	"chat.queued": { ko: "대기 중", en: "queued", ja: "queued", zh: "queued", fr: "queued", de: "queued", ru: "queued", es: "queued", ar: "queued", hi: "queued", bn: "queued", pt: "queued", id: "queued", vi: "queued" },

	// Onboarding (conversational)
	"onboard.provider.title": {
		ko: "어떤 두뇌를 사용할까요?",
		en: "Which brain should we use?", ja: "Which brain should we use?", zh: "Which brain should we use?", fr: "Which brain should we use?", de: "Which brain should we use?", ru: "Which brain should we use?", es: "Which brain should we use?", ar: "Which brain should we use?", hi: "Which brain should we use?", bn: "Which brain should we use?", pt: "Which brain should we use?", id: "Which brain should we use?", vi: "Which brain should we use?",
	},
	"onboard.agentName.title": {
		ko: "안녕! 나에게 이름을 지어줘!",
		en: "Hi! Give me a name!", ja: "Hi! Give me a name!", zh: "Hi! Give me a name!", fr: "Hi! Give me a name!", de: "Hi! Give me a name!", ru: "Hi! Give me a name!", es: "Hi! Give me a name!", ar: "Hi! Give me a name!", hi: "Hi! Give me a name!", bn: "Hi! Give me a name!", pt: "Hi! Give me a name!", id: "Hi! Give me a name!", vi: "Hi! Give me a name!",
	},
	"onboard.agentName.description": {
		ko: "",
		en: "",
	},
	"onboard.userName.title": {
		ko: "나는 {agent}! 너는 뭐라고 부르면 돼?",
		en: "I'm {agent}! What should I call you?", ja: "I'm {agent}! What should I call you?", zh: "I'm {agent}! What should I call you?", fr: "I'm {agent}! What should I call you?", de: "I'm {agent}! What should I call you?", ru: "I'm {agent}! What should I call you?", es: "I'm {agent}! What should I call you?", ar: "I'm {agent}! What should I call you?", hi: "I'm {agent}! What should I call you?", bn: "I'm {agent}! What should I call you?", pt: "I'm {agent}! What should I call you?", id: "I'm {agent}! What should I call you?", vi: "I'm {agent}! What should I call you?",
	},
	"onboard.userName.description": {
		ko: "",
		en: "",
	},
	"onboard.name.placeholder": { ko: "이름을 입력하세요", en: "Enter a name", ja: "Enter a name", zh: "Enter a name", fr: "Enter a name", de: "Enter a name", ru: "Enter a name", es: "Enter a name", ar: "Enter a name", hi: "Enter a name", bn: "Enter a name", pt: "Enter a name", id: "Enter a name", vi: "Enter a name" },
	"onboard.character.title": {
		ko: "{user}, {agent}의 모습을 골라줘",
		en: "{user}, choose {agent}'s look", ja: "{user}, choose {agent}'s look", zh: "{user}, choose {agent}'s look", fr: "{user}, choose {agent}'s look", de: "{user}, choose {agent}'s look", ru: "{user}, choose {agent}'s look", es: "{user}, choose {agent}'s look", ar: "{user}, choose {agent}'s look", hi: "{user}, choose {agent}'s look", bn: "{user}, choose {agent}'s look", pt: "{user}, choose {agent}'s look", id: "{user}, choose {agent}'s look", vi: "{user}, choose {agent}'s look",
	},
	"onboard.character.hint": {
		ko: "나중에 설정에서 나만의 VRM 모델을 추가할 수 있어요.",
		en: "You can add your own VRM model later in Settings.", ja: "You can add your own VRM model later in Settings.", zh: "You can add your own VRM model later in Settings.", fr: "You can add your own VRM model later in Settings.", de: "You can add your own VRM model later in Settings.", ru: "You can add your own VRM model later in Settings.", es: "You can add your own VRM model later in Settings.", ar: "You can add your own VRM model later in Settings.", hi: "You can add your own VRM model later in Settings.", bn: "You can add your own VRM model later in Settings.", pt: "You can add your own VRM model later in Settings.", id: "You can add your own VRM model later in Settings.", vi: "You can add your own VRM model later in Settings.",
	},
	"onboard.personality.title": {
		ko: "{agent}의 성격을 골라줘!",
		en: "Choose {agent}'s personality!", ja: "Choose {agent}'s personality!", zh: "Choose {agent}'s personality!", fr: "Choose {agent}'s personality!", de: "Choose {agent}'s personality!", ru: "Choose {agent}'s personality!", es: "Choose {agent}'s personality!", ar: "Choose {agent}'s personality!", hi: "Choose {agent}'s personality!", bn: "Choose {agent}'s personality!", pt: "Choose {agent}'s personality!", id: "Choose {agent}'s personality!", vi: "Choose {agent}'s personality!",
	},
	"onboard.personality.hint": {
		ko: "나중에 설정에서 자유롭게 수정할 수 있어요.",
		en: "You can edit this later in Settings.", ja: "You can edit this later in Settings.", zh: "You can edit this later in Settings.", fr: "You can edit this later in Settings.", de: "You can edit this later in Settings.", ru: "You can edit this later in Settings.", es: "You can edit this later in Settings.", ar: "You can edit this later in Settings.", hi: "You can edit this later in Settings.", bn: "You can edit this later in Settings.", pt: "You can edit this later in Settings.", id: "You can edit this later in Settings.", vi: "You can edit this later in Settings.",
	},
	"onboard.apiKey.title": {
		ko: "API 키를 입력해주세요",
		en: "Enter your API key", ja: "Enter your API key", zh: "Enter your API key", fr: "Enter your API key", de: "Enter your API key", ru: "Enter your API key", es: "Enter your API key", ar: "Enter your API key", hi: "Enter your API key", bn: "Enter your API key", pt: "Enter your API key", id: "Enter your API key", vi: "Enter your API key",
	},
	"onboard.apiKey.validate": { ko: "연결 확인", en: "Validate", ja: "Validate", zh: "Validate", fr: "Validate", de: "Validate", ru: "Validate", es: "Validate", ar: "Validate", hi: "Validate", bn: "Validate", pt: "Validate", id: "Validate", vi: "Validate" },
	"onboard.apiKey.validating": { ko: "확인 중...", en: "Validating...", ja: "Validating...", zh: "Validating...", fr: "Validating...", de: "Validating...", ru: "Validating...", es: "Validating...", ar: "Validating...", hi: "Validating...", bn: "Validating...", pt: "Validating...", id: "Validating...", vi: "Validating..." },
	"onboard.apiKey.success": { ko: "연결 성공!", en: "Connected!", ja: "Connected!", zh: "Connected!", fr: "Connected!", de: "Connected!", ru: "Connected!", es: "Connected!", ar: "Connected!", hi: "Connected!", bn: "Connected!", pt: "Connected!", id: "Connected!", vi: "Connected!" },
	"onboard.apiKey.error": {
		ko: "연결 실패. 키를 확인해주세요.",
		en: "Connection failed. Check your key.", ja: "Connection failed. Check your key.", zh: "Connection failed. Check your key.", fr: "Connection failed. Check your key.", de: "Connection failed. Check your key.", ru: "Connection failed. Check your key.", es: "Connection failed. Check your key.", ar: "Connection failed. Check your key.", hi: "Connection failed. Check your key.", bn: "Connection failed. Check your key.", pt: "Connection failed. Check your key.", id: "Connection failed. Check your key.", vi: "Connection failed. Check your key.",
	},
	"onboard.complete.greeting": {
		ko: "반가워요, {name}!",
		en: "Nice to meet you, {name}!", ja: "Nice to meet you, {name}!", zh: "Nice to meet you, {name}!", fr: "Nice to meet you, {name}!", de: "Nice to meet you, {name}!", ru: "Nice to meet you, {name}!", es: "Nice to meet you, {name}!", ar: "Nice to meet you, {name}!", hi: "Nice to meet you, {name}!", bn: "Nice to meet you, {name}!", pt: "Nice to meet you, {name}!", id: "Nice to meet you, {name}!", vi: "Nice to meet you, {name}!",
	},
	"onboard.complete.ready": {
		ko: "{agent} 준비 완료! 이제 시작해볼까요?",
		en: "{agent} is ready! Shall we begin?", ja: "{agent} is ready! Shall we begin?", zh: "{agent} is ready! Shall we begin?", fr: "{agent} is ready! Shall we begin?", de: "{agent} is ready! Shall we begin?", ru: "{agent} is ready! Shall we begin?", es: "{agent} is ready! Shall we begin?", ar: "{agent} is ready! Shall we begin?", hi: "{agent} is ready! Shall we begin?", bn: "{agent} is ready! Shall we begin?", pt: "{agent} is ready! Shall we begin?", id: "{agent} is ready! Shall we begin?", vi: "{agent} is ready! Shall we begin?",
	},
	"onboard.complete.start": { ko: "시작하기", en: "Get Started", ja: "Get Started", zh: "Get Started", fr: "Get Started", de: "Get Started", ru: "Get Started", es: "Get Started", ar: "Get Started", hi: "Get Started", bn: "Get Started", pt: "Get Started", id: "Get Started", vi: "Get Started" },
	"onboard.next": { ko: "다음", en: "Next", ja: "Next", zh: "Next", fr: "Next", de: "Next", ru: "Next", es: "Next", ar: "Next", hi: "Next", bn: "Next", pt: "Next", id: "Next", vi: "Next" },
	"onboard.back": { ko: "이전", en: "Back", ja: "Back", zh: "Back", fr: "Back", de: "Back", ru: "Back", es: "Back", ar: "Back", hi: "Back", bn: "Back", pt: "Back", id: "Back", vi: "Back" },
	"onboard.skip": { ko: "건너뛰기", en: "Skip", ja: "Skip", zh: "Skip", fr: "Skip", de: "Skip", ru: "Skip", es: "Skip", ar: "Skip", hi: "Skip", bn: "Skip", pt: "Skip", id: "Skip", vi: "Skip" },

	// Session summarization (4.4b)
	"chat.summarizing": { ko: "요약 중...", en: "Summarizing...", ja: "Summarizing...", zh: "Summarizing...", fr: "Summarizing...", de: "Summarizing...", ru: "Summarizing...", es: "Summarizing...", ar: "Summarizing...", hi: "Summarizing...", bn: "Summarizing...", pt: "Summarizing...", id: "Summarizing...", vi: "Summarizing..." },
	"chat.summarized": { ko: "요약 완료", en: "Summarized", ja: "Summarized", zh: "Summarized", fr: "Summarized", de: "Summarized", ru: "Summarized", es: "Summarized", ar: "Summarized", hi: "Summarized", bn: "Summarized", pt: "Summarized", id: "Summarized", vi: "Summarized" },

	// Facts (4.4c)
	"settings.memorySection": { ko: "기억", en: "Memory", ja: "Memory", zh: "Memory", fr: "Memory", de: "Memory", ru: "Memory", es: "Memory", ar: "Memory", hi: "Memory", bn: "Memory", pt: "Memory", id: "Memory", vi: "Memory" },
	"settings.factsEmpty": {
		ko: "저장된 기억이 없습니다.",
		en: "No stored memories.", ja: "No stored memories.", zh: "No stored memories.", fr: "No stored memories.", de: "No stored memories.", ru: "No stored memories.", es: "No stored memories.", ar: "No stored memories.", hi: "No stored memories.", bn: "No stored memories.", pt: "No stored memories.", id: "No stored memories.", vi: "No stored memories.",
	},
	"settings.factDelete": { ko: "삭제", en: "Delete", ja: "Delete", zh: "Delete", fr: "Delete", de: "Delete", ru: "Delete", es: "Delete", ar: "Delete", hi: "Delete", bn: "Delete", pt: "Delete", id: "Delete", vi: "Delete" },
	"chat.extractingFacts": {
		ko: "기억 추출 중...",
		en: "Extracting memories...", ja: "Extracting memories...", zh: "Extracting memories...", fr: "Extracting memories...", de: "Extracting memories...", ru: "Extracting memories...", es: "Extracting memories...", ar: "Extracting memories...", hi: "Extracting memories...", bn: "Extracting memories...", pt: "Extracting memories...", id: "Extracting memories...", vi: "Extracting memories...",
	},

	// Avatar & Background (VRM/BG picker)
	"settings.avatarSection": { ko: "아바타", en: "Avatar", ja: "Avatar", zh: "Avatar", fr: "Avatar", de: "Avatar", ru: "Avatar", es: "Avatar", ar: "Avatar", hi: "Avatar", bn: "Avatar", pt: "Avatar", id: "Avatar", vi: "Avatar" },
	"settings.vrmModel": { ko: "VRM 모델", en: "VRM Model", ja: "VRM Model", zh: "VRM Model", fr: "VRM Model", de: "VRM Model", ru: "VRM Model", es: "VRM Model", ar: "VRM Model", hi: "VRM Model", bn: "VRM Model", pt: "VRM Model", id: "VRM Model", vi: "VRM Model" },
	"settings.vrmCustom": { ko: "파일 선택...", en: "Choose File...", ja: "Choose File...", zh: "Choose File...", fr: "Choose File...", de: "Choose File...", ru: "Choose File...", es: "Choose File...", ar: "Choose File...", hi: "Choose File...", bn: "Choose File...", pt: "Choose File...", id: "Choose File...", vi: "Choose File..." },
	"settings.backgroundSection": {
		ko: "배경",
		en: "Background", ja: "Background", zh: "Background", fr: "Background", de: "Background", ru: "Background", es: "Background", ar: "Background", hi: "Background", bn: "Background", pt: "Background", id: "Background", vi: "Background",
	},
	"settings.bgCustom": { ko: "파일 선택...", en: "Choose File...", ja: "Choose File...", zh: "Choose File...", fr: "Choose File...", de: "Choose File...", ru: "Choose File...", es: "Choose File...", ar: "Choose File...", hi: "Choose File...", bn: "Choose File...", pt: "Choose File...", id: "Choose File...", vi: "Choose File..." },
	"settings.bgNone": { ko: "기본 그라데이션", en: "Default Gradient", ja: "Default Gradient", zh: "Default Gradient", fr: "Default Gradient", de: "Default Gradient", ru: "Default Gradient", es: "Default Gradient", ar: "Default Gradient", hi: "Default Gradient", bn: "Default Gradient", pt: "Default Gradient", id: "Default Gradient", vi: "Default Gradient" },

	// Lab integration (Phase 5)
	"onboard.lab.title": {
		ko: "Lab 계정으로 바로 시작하기",
		en: "Get started with Lab account", ja: "Get started with Lab account", zh: "Get started with Lab account", fr: "Get started with Lab account", de: "Get started with Lab account", ru: "Get started with Lab account", es: "Get started with Lab account", ar: "Get started with Lab account", hi: "Get started with Lab account", bn: "Get started with Lab account", pt: "Get started with Lab account", id: "Get started with Lab account", vi: "Get started with Lab account",
	},
	"onboard.lab.description": {
		ko: "API 키 없이 무료로 바로 사용할 수 있고, 설정도 저장/복원됩니다.",
		en: "Free to use without an API key. Settings are saved and restored.", ja: "Free to use without an API key. Settings are saved and restored.", zh: "Free to use without an API key. Settings are saved and restored.", fr: "Free to use without an API key. Settings are saved and restored.", de: "Free to use without an API key. Settings are saved and restored.", ru: "Free to use without an API key. Settings are saved and restored.", es: "Free to use without an API key. Settings are saved and restored.", ar: "Free to use without an API key. Settings are saved and restored.", hi: "Free to use without an API key. Settings are saved and restored.", bn: "Free to use without an API key. Settings are saved and restored.", pt: "Free to use without an API key. Settings are saved and restored.", id: "Free to use without an API key. Settings are saved and restored.", vi: "Free to use without an API key. Settings are saved and restored.",
	},
	"onboard.lab.login": { ko: "Lab 로그인", en: "Lab Login", ja: "Lab Login", zh: "Lab Login", fr: "Lab Login", de: "Lab Login", ru: "Lab Login", es: "Lab Login", ar: "Lab Login", hi: "Lab Login", bn: "Lab Login", pt: "Lab Login", id: "Lab Login", vi: "Lab Login" },
	"onboard.lab.waiting": {
		ko: "로그인 대기 중...",
		en: "Waiting for login...", ja: "Waiting for login...", zh: "Waiting for login...", fr: "Waiting for login...", de: "Waiting for login...", ru: "Waiting for login...", es: "Waiting for login...", ar: "Waiting for login...", hi: "Waiting for login...", bn: "Waiting for login...", pt: "Waiting for login...", id: "Waiting for login...", vi: "Waiting for login...",
	},
	"onboard.lab.or": { ko: "또는 직접 API 키 입력", en: "or enter API key manually", ja: "or enter API key manually", zh: "or enter API key manually", fr: "or enter API key manually", de: "or enter API key manually", ru: "or enter API key manually", es: "or enter API key manually", ar: "or enter API key manually", hi: "or enter API key manually", bn: "or enter API key manually", pt: "or enter API key manually", id: "or enter API key manually", vi: "or enter API key manually" },
	"onboard.lab.timeout": {
		ko: "로그인 응답이 없어요. 다시 시도해주세요.",
		en: "No login response. Please try again.", ja: "No login response. Please try again.", zh: "No login response. Please try again.", fr: "No login response. Please try again.", de: "No login response. Please try again.", ru: "No login response. Please try again.", es: "No login response. Please try again.", ar: "No login response. Please try again.", hi: "No login response. Please try again.", bn: "No login response. Please try again.", pt: "No login response. Please try again.", id: "No login response. Please try again.", vi: "No login response. Please try again.",
	},
	"settings.labSection": { ko: "Naia Lab 계정", en: "Naia Lab Account", ja: "Naia Lab Account", zh: "Naia Lab Account", fr: "Naia Lab Account", de: "Naia Lab Account", ru: "Naia Lab Account", es: "Naia Lab Account", ar: "Naia Lab Account", hi: "Naia Lab Account", bn: "Naia Lab Account", pt: "Naia Lab Account", id: "Naia Lab Account", vi: "Naia Lab Account" },
	"settings.labConnected": { ko: "연결됨", en: "Connected", ja: "Connected", zh: "Connected", fr: "Connected", de: "Connected", ru: "Connected", es: "Connected", ar: "Connected", hi: "Connected", bn: "Connected", pt: "Connected", id: "Connected", vi: "Connected" },
	"settings.labDisconnected": { ko: "미연결", en: "Not Connected", ja: "Not Connected", zh: "Not Connected", fr: "Not Connected", de: "Not Connected", ru: "Not Connected", es: "Not Connected", ar: "Not Connected", hi: "Not Connected", bn: "Not Connected", pt: "Not Connected", id: "Not Connected", vi: "Not Connected" },
	"settings.labConnect": { ko: "Lab 로그인", en: "Lab Login", ja: "Lab Login", zh: "Lab Login", fr: "Lab Login", de: "Lab Login", ru: "Lab Login", es: "Lab Login", ar: "Lab Login", hi: "Lab Login", bn: "Lab Login", pt: "Lab Login", id: "Lab Login", vi: "Lab Login" },
	"settings.labDisconnect": { ko: "연결 해제", en: "Disconnect", ja: "Disconnect", zh: "Disconnect", fr: "Disconnect", de: "Disconnect", ru: "Disconnect", es: "Disconnect", ar: "Disconnect", hi: "Disconnect", bn: "Disconnect", pt: "Disconnect", id: "Disconnect", vi: "Disconnect" },
	"settings.labDisconnectConfirm": {
		ko: "Lab 연결을 해제하시겠습니까?",
		en: "Disconnect Lab account?", ja: "Disconnect Lab account?", zh: "Disconnect Lab account?", fr: "Disconnect Lab account?", de: "Disconnect Lab account?", ru: "Disconnect Lab account?", es: "Disconnect Lab account?", ar: "Disconnect Lab account?", hi: "Disconnect Lab account?", bn: "Disconnect Lab account?", pt: "Disconnect Lab account?", id: "Disconnect Lab account?", vi: "Disconnect Lab account?",
	},
	"settings.labUserId": { ko: "유저 ID", en: "User ID", ja: "User ID", zh: "User ID", fr: "User ID", de: "User ID", ru: "User ID", es: "User ID", ar: "User ID", hi: "User ID", bn: "User ID", pt: "User ID", id: "User ID", vi: "User ID" },
	"settings.manual": { ko: "사용법 매뉴얼", en: "User Manual", ja: "User Manual", zh: "User Manual", fr: "User Manual", de: "User Manual", ru: "User Manual", es: "User Manual", ar: "User Manual", hi: "User Manual", bn: "User Manual", pt: "User Manual", id: "User Manual", vi: "User Manual" },
	"settings.labDashboard": { ko: "대시보드", en: "Dashboard", ja: "Dashboard", zh: "Dashboard", fr: "Dashboard", de: "Dashboard", ru: "Dashboard", es: "Dashboard", ar: "Dashboard", hi: "Dashboard", bn: "Dashboard", pt: "Dashboard", id: "Dashboard", vi: "Dashboard" },
	"settings.labBalance": { ko: "크레딧 잔액", en: "Credit Balance", ja: "Credit Balance", zh: "Credit Balance", fr: "Credit Balance", de: "Credit Balance", ru: "Credit Balance", es: "Credit Balance", ar: "Credit Balance", hi: "Credit Balance", bn: "Credit Balance", pt: "Credit Balance", id: "Credit Balance", vi: "Credit Balance" },
	"settings.labBalanceLoading": {
		ko: "잔액 조회 중...",
		en: "Loading balance...", ja: "Loading balance...", zh: "Loading balance...", fr: "Loading balance...", de: "Loading balance...", ru: "Loading balance...", es: "Loading balance...", ar: "Loading balance...", hi: "Loading balance...", bn: "Loading balance...", pt: "Loading balance...", id: "Loading balance...", vi: "Loading balance...",
	},
	"cost.labBalance": { ko: "Lab 잔액", en: "Lab Balance", ja: "Lab Balance", zh: "Lab Balance", fr: "Lab Balance", de: "Lab Balance", ru: "Lab Balance", es: "Lab Balance", ar: "Lab Balance", hi: "Lab Balance", bn: "Lab Balance", pt: "Lab Balance", id: "Lab Balance", vi: "Lab Balance" },
	"cost.labCredits": { ko: "크레딧", en: "credits", ja: "credits", zh: "credits", fr: "credits", de: "credits", ru: "credits", es: "credits", ar: "credits", hi: "credits", bn: "credits", pt: "credits", id: "credits", vi: "credits" },
	"cost.labCharge": { ko: "크레딧 충전", en: "Charge Credits", ja: "Charge Credits", zh: "Charge Credits", fr: "Charge Credits", de: "Charge Credits", ru: "Charge Credits", es: "Charge Credits", ar: "Charge Credits", hi: "Charge Credits", bn: "Charge Credits", pt: "Charge Credits", id: "Charge Credits", vi: "Charge Credits" },
	"cost.labLoading": { ko: "잔액 조회 중...", en: "Loading balance...", ja: "Loading balance...", zh: "Loading balance...", fr: "Loading balance...", de: "Loading balance...", ru: "Loading balance...", es: "Loading balance...", ar: "Loading balance...", hi: "Loading balance...", bn: "Loading balance...", pt: "Loading balance...", id: "Loading balance...", vi: "Loading balance..." },
	"cost.labError": { ko: "잔액 조회 실패", en: "Failed to load balance", ja: "Failed to load balance", zh: "Failed to load balance", fr: "Failed to load balance", de: "Failed to load balance", ru: "Failed to load balance", es: "Failed to load balance", ar: "Failed to load balance", hi: "Failed to load balance", bn: "Failed to load balance", pt: "Failed to load balance", id: "Failed to load balance", vi: "Failed to load balance" },

	// Channels Tab (Phase 4)
	"channels.tabChannels": { ko: "채널", en: "Channels", ja: "Channels", zh: "Channels", fr: "Channels", de: "Channels", ru: "Channels", es: "Channels", ar: "Channels", hi: "Channels", bn: "Channels", pt: "Channels", id: "Channels", vi: "Channels" },
	"channels.title": { ko: "메시징 채널", en: "Messaging Channels", ja: "Messaging Channels", zh: "Messaging Channels", fr: "Messaging Channels", de: "Messaging Channels", ru: "Messaging Channels", es: "Messaging Channels", ar: "Messaging Channels", hi: "Messaging Channels", bn: "Messaging Channels", pt: "Messaging Channels", id: "Messaging Channels", vi: "Messaging Channels" },
	"channels.loading": { ko: "채널 로딩 중...", en: "Loading channels...", ja: "Loading channels...", zh: "Loading channels...", fr: "Loading channels...", de: "Loading channels...", ru: "Loading channels...", es: "Loading channels...", ar: "Loading channels...", hi: "Loading channels...", bn: "Loading channels...", pt: "Loading channels...", id: "Loading channels...", vi: "Loading channels..." },
	"channels.empty": {
		ko: "연결된 채널이 없습니다. Gateway가 실행 중인지 확인하세요.",
		en: "No channels connected. Make sure Gateway is running.", ja: "No channels connected. Make sure Gateway is running.", zh: "No channels connected. Make sure Gateway is running.", fr: "No channels connected. Make sure Gateway is running.", de: "No channels connected. Make sure Gateway is running.", ru: "No channels connected. Make sure Gateway is running.", es: "No channels connected. Make sure Gateway is running.", ar: "No channels connected. Make sure Gateway is running.", hi: "No channels connected. Make sure Gateway is running.", bn: "No channels connected. Make sure Gateway is running.", pt: "No channels connected. Make sure Gateway is running.", id: "No channels connected. Make sure Gateway is running.", vi: "No channels connected. Make sure Gateway is running.",
	},
	"channels.connected": { ko: "연결됨", en: "Connected", ja: "Connected", zh: "Connected", fr: "Connected", de: "Connected", ru: "Connected", es: "Connected", ar: "Connected", hi: "Connected", bn: "Connected", pt: "Connected", id: "Connected", vi: "Connected" },
	"channels.disconnected": { ko: "연결 안 됨", en: "Disconnected", ja: "Disconnected", zh: "Disconnected", fr: "Disconnected", de: "Disconnected", ru: "Disconnected", es: "Disconnected", ar: "Disconnected", hi: "Disconnected", bn: "Disconnected", pt: "Disconnected", id: "Disconnected", vi: "Disconnected" },
	"channels.enabled": { ko: "활성", en: "Enabled", ja: "Enabled", zh: "Enabled", fr: "Enabled", de: "Enabled", ru: "Enabled", es: "Enabled", ar: "Enabled", hi: "Enabled", bn: "Enabled", pt: "Enabled", id: "Enabled", vi: "Enabled" },
	"channels.disabled": { ko: "비활성", en: "Disabled", ja: "Disabled", zh: "Disabled", fr: "Disabled", de: "Disabled", ru: "Disabled", es: "Disabled", ar: "Disabled", hi: "Disabled", bn: "Disabled", pt: "Disabled", id: "Disabled", vi: "Disabled" },
	"channels.logout": { ko: "로그아웃", en: "Logout", ja: "Logout", zh: "Logout", fr: "Logout", de: "Logout", ru: "Logout", es: "Logout", ar: "Logout", hi: "Logout", bn: "Logout", pt: "Logout", id: "Logout", vi: "Logout" },
	"channels.logoutConfirm": {
		ko: "이 채널에서 로그아웃하시겠습니까?",
		en: "Log out of this channel?", ja: "Log out of this channel?", zh: "Log out of this channel?", fr: "Log out of this channel?", de: "Log out of this channel?", ru: "Log out of this channel?", es: "Log out of this channel?", ar: "Log out of this channel?", hi: "Log out of this channel?", bn: "Log out of this channel?", pt: "Log out of this channel?", id: "Log out of this channel?", vi: "Log out of this channel?",
	},
	"channels.login": { ko: "로그인", en: "Login", ja: "Login", zh: "Login", fr: "Login", de: "Login", ru: "Login", es: "Login", ar: "Login", hi: "Login", bn: "Login", pt: "Login", id: "Login", vi: "Login" },
	"channels.loginQr": {
		ko: "QR 코드를 스캔하여 로그인하세요",
		en: "Scan the QR code to log in", ja: "Scan the QR code to log in", zh: "Scan the QR code to log in", fr: "Scan the QR code to log in", de: "Scan the QR code to log in", ru: "Scan the QR code to log in", es: "Scan the QR code to log in", ar: "Scan the QR code to log in", hi: "Scan the QR code to log in", bn: "Scan the QR code to log in", pt: "Scan the QR code to log in", id: "Scan the QR code to log in", vi: "Scan the QR code to log in",
	},
	"channels.loginWaiting": {
		ko: "QR 스캔 대기 중...",
		en: "Waiting for QR scan...", ja: "Waiting for QR scan...", zh: "Waiting for QR scan...", fr: "Waiting for QR scan...", de: "Waiting for QR scan...", ru: "Waiting for QR scan...", es: "Waiting for QR scan...", ar: "Waiting for QR scan...", hi: "Waiting for QR scan...", bn: "Waiting for QR scan...", pt: "Waiting for QR scan...", id: "Waiting for QR scan...", vi: "Waiting for QR scan...",
	},
	"channels.noAccounts": {
		ko: "계정 없음",
		en: "No accounts", ja: "No accounts", zh: "No accounts", fr: "No accounts", de: "No accounts", ru: "No accounts", es: "No accounts", ar: "No accounts", hi: "No accounts", bn: "No accounts", pt: "No accounts", id: "No accounts", vi: "No accounts",
	},
	"channels.error": { ko: "오류", en: "Error", ja: "Error", zh: "Error", fr: "Error", de: "Error", ru: "Error", es: "Error", ar: "Error", hi: "Error", bn: "Error", pt: "Error", id: "Error", vi: "Error" },
	"channels.refresh": { ko: "새로고침", en: "Refresh", ja: "Refresh", zh: "Refresh", fr: "Refresh", de: "Refresh", ru: "Refresh", es: "Refresh", ar: "Refresh", hi: "Refresh", bn: "Refresh", pt: "Refresh", id: "Refresh", vi: "Refresh" },
	"channels.gatewayRequired": {
		ko: "Gateway 연결이 필요합니다. 설정에서 Gateway URL을 확인하세요.",
		en: "Gateway connection required. Check Gateway URL in settings.", ja: "Gateway connection required. Check Gateway URL in settings.", zh: "Gateway connection required. Check Gateway URL in settings.", fr: "Gateway connection required. Check Gateway URL in settings.", de: "Gateway connection required. Check Gateway URL in settings.", ru: "Gateway connection required. Check Gateway URL in settings.", es: "Gateway connection required. Check Gateway URL in settings.", ar: "Gateway connection required. Check Gateway URL in settings.", hi: "Gateway connection required. Check Gateway URL in settings.", bn: "Gateway connection required. Check Gateway URL in settings.", pt: "Gateway connection required. Check Gateway URL in settings.", id: "Gateway connection required. Check Gateway URL in settings.", vi: "Gateway connection required. Check Gateway URL in settings.",
	},

	// Channel settings section (Phase 4)
	"settings.channelsSection": {
		ko: "채널 관리",
		en: "Channel Management", ja: "Channel Management", zh: "Channel Management", fr: "Channel Management", de: "Channel Management", ru: "Channel Management", es: "Channel Management", ar: "Channel Management", hi: "Channel Management", bn: "Channel Management", pt: "Channel Management", id: "Channel Management", vi: "Channel Management",
	},
	"settings.channelsHint": {
		ko: "Gateway를 통해 Discord, Slack, Telegram 등의 채널을 관리합니다.",
		en: "Manage Discord, Slack, Telegram and other channels via Gateway.", ja: "Manage Discord, Slack, Telegram and other channels via Gateway.", zh: "Manage Discord, Slack, Telegram and other channels via Gateway.", fr: "Manage Discord, Slack, Telegram and other channels via Gateway.", de: "Manage Discord, Slack, Telegram and other channels via Gateway.", ru: "Manage Discord, Slack, Telegram and other channels via Gateway.", es: "Manage Discord, Slack, Telegram and other channels via Gateway.", ar: "Manage Discord, Slack, Telegram and other channels via Gateway.", hi: "Manage Discord, Slack, Telegram and other channels via Gateway.", bn: "Manage Discord, Slack, Telegram and other channels via Gateway.", pt: "Manage Discord, Slack, Telegram and other channels via Gateway.", id: "Manage Discord, Slack, Telegram and other channels via Gateway.", vi: "Manage Discord, Slack, Telegram and other channels via Gateway.",
	},
	"settings.channelsOpenTab": {
		ko: "채널 탭에서 관리",
		en: "Manage in Channels tab", ja: "Manage in Channels tab", zh: "Manage in Channels tab", fr: "Manage in Channels tab", de: "Manage in Channels tab", ru: "Manage in Channels tab", es: "Manage in Channels tab", ar: "Manage in Channels tab", hi: "Manage in Channels tab", bn: "Manage in Channels tab", pt: "Manage in Channels tab", id: "Manage in Channels tab", vi: "Manage in Channels tab",
	},

	// Gateway TTS section (Phase 5)
	"settings.gatewayTtsSection": {
		ko: "Gateway TTS",
		en: "Gateway TTS", ja: "Gateway TTS", zh: "Gateway TTS", fr: "Gateway TTS", de: "Gateway TTS", ru: "Gateway TTS", es: "Gateway TTS", ar: "Gateway TTS", hi: "Gateway TTS", bn: "Gateway TTS", pt: "Gateway TTS", id: "Gateway TTS", vi: "Gateway TTS",
	},
	"settings.gatewayTtsHint": {
		ko: "Gateway를 통해 OpenAI, ElevenLabs, Edge TTS 프로바이더를 사용합니다.",
		en: "Use OpenAI, ElevenLabs, Edge TTS providers via Gateway.", ja: "Use OpenAI, ElevenLabs, Edge TTS providers via Gateway.", zh: "Use OpenAI, ElevenLabs, Edge TTS providers via Gateway.", fr: "Use OpenAI, ElevenLabs, Edge TTS providers via Gateway.", de: "Use OpenAI, ElevenLabs, Edge TTS providers via Gateway.", ru: "Use OpenAI, ElevenLabs, Edge TTS providers via Gateway.", es: "Use OpenAI, ElevenLabs, Edge TTS providers via Gateway.", ar: "Use OpenAI, ElevenLabs, Edge TTS providers via Gateway.", hi: "Use OpenAI, ElevenLabs, Edge TTS providers via Gateway.", bn: "Use OpenAI, ElevenLabs, Edge TTS providers via Gateway.", pt: "Use OpenAI, ElevenLabs, Edge TTS providers via Gateway.", id: "Use OpenAI, ElevenLabs, Edge TTS providers via Gateway.", vi: "Use OpenAI, ElevenLabs, Edge TTS providers via Gateway.",
	},
	"settings.gatewayTtsProvider": {
		ko: "TTS 프로바이더",
		en: "TTS Provider", ja: "TTS Provider", zh: "TTS Provider", fr: "TTS Provider", de: "TTS Provider", ru: "TTS Provider", es: "TTS Provider", ar: "TTS Provider", hi: "TTS Provider", bn: "TTS Provider", pt: "TTS Provider", id: "TTS Provider", vi: "TTS Provider",
	},
	"settings.gatewayTtsLoading": {
		ko: "프로바이더 로딩...",
		en: "Loading providers...", ja: "Loading providers...", zh: "Loading providers...", fr: "Loading providers...", de: "Loading providers...", ru: "Loading providers...", es: "Loading providers...", ar: "Loading providers...", hi: "Loading providers...", bn: "Loading providers...", pt: "Loading providers...", id: "Loading providers...", vi: "Loading providers...",
	},
	"settings.gatewayTtsNone": {
		ko: "프로바이더 없음",
		en: "No providers available", ja: "No providers available", zh: "No providers available", fr: "No providers available", de: "No providers available", ru: "No providers available", es: "No providers available", ar: "No providers available", hi: "No providers available", bn: "No providers available", pt: "No providers available", id: "No providers available", vi: "No providers available",
	},
	"settings.gatewayTtsNotConfigured": {
		ko: "(미설정)",
		en: "(not configured)", ja: "(not configured)", zh: "(not configured)", fr: "(not configured)", de: "(not configured)", ru: "(not configured)", es: "(not configured)", ar: "(not configured)", hi: "(not configured)", bn: "(not configured)", pt: "(not configured)", id: "(not configured)", vi: "(not configured)",
	},

	// Voice wake section (Phase 5)
	"settings.voiceWakeSection": {
		ko: "음성 활성화",
		en: "Voice Wake", ja: "Voice Wake", zh: "Voice Wake", fr: "Voice Wake", de: "Voice Wake", ru: "Voice Wake", es: "Voice Wake", ar: "Voice Wake", hi: "Voice Wake", bn: "Voice Wake", pt: "Voice Wake", id: "Voice Wake", vi: "Voice Wake",
	},
	"settings.voiceWakeHint": {
		ko: "호출어를 말하면 AI가 깨어납니다.",
		en: "Say the wake word to activate AI.", ja: "Say the wake word to activate AI.", zh: "Say the wake word to activate AI.", fr: "Say the wake word to activate AI.", de: "Say the wake word to activate AI.", ru: "Say the wake word to activate AI.", es: "Say the wake word to activate AI.", ar: "Say the wake word to activate AI.", hi: "Say the wake word to activate AI.", bn: "Say the wake word to activate AI.", pt: "Say the wake word to activate AI.", id: "Say the wake word to activate AI.", vi: "Say the wake word to activate AI.",
	},
	"settings.voiceWakeTriggers": {
		ko: "호출어 목록",
		en: "Wake Triggers", ja: "Wake Triggers", zh: "Wake Triggers", fr: "Wake Triggers", de: "Wake Triggers", ru: "Wake Triggers", es: "Wake Triggers", ar: "Wake Triggers", hi: "Wake Triggers", bn: "Wake Triggers", pt: "Wake Triggers", id: "Wake Triggers", vi: "Wake Triggers",
	},
	"settings.voiceWakeAdd": {
		ko: "추가",
		en: "Add", ja: "Add", zh: "Add", fr: "Add", de: "Add", ru: "Add", es: "Add", ar: "Add", hi: "Add", bn: "Add", pt: "Add", id: "Add", vi: "Add",
	},
	"settings.voiceWakeRemove": {
		ko: "제거",
		en: "Remove", ja: "Remove", zh: "Remove", fr: "Remove", de: "Remove", ru: "Remove", es: "Remove", ar: "Remove", hi: "Remove", bn: "Remove", pt: "Remove", id: "Remove", vi: "Remove",
	},
	"settings.voiceWakePlaceholder": {
		ko: "호출어 입력...",
		en: "Enter wake word...", ja: "Enter wake word...", zh: "Enter wake word...", fr: "Enter wake word...", de: "Enter wake word...", ru: "Enter wake word...", es: "Enter wake word...", ar: "Enter wake word...", hi: "Enter wake word...", bn: "Enter wake word...", pt: "Enter wake word...", id: "Enter wake word...", vi: "Enter wake word...",
	},
	"settings.voiceWakeSave": {
		ko: "호출어 저장",
		en: "Save Triggers", ja: "Save Triggers", zh: "Save Triggers", fr: "Save Triggers", de: "Save Triggers", ru: "Save Triggers", es: "Save Triggers", ar: "Save Triggers", hi: "Save Triggers", bn: "Save Triggers", pt: "Save Triggers", id: "Save Triggers", vi: "Save Triggers",
	},
	"settings.voiceWakeSaved": {
		ko: "저장됨!",
		en: "Saved!", ja: "Saved!", zh: "Saved!", fr: "Saved!", de: "Saved!", ru: "Saved!", es: "Saved!", ar: "Saved!", hi: "Saved!", bn: "Saved!", pt: "Saved!", id: "Saved!", vi: "Saved!",
	},
	"settings.voiceWakeLoading": {
		ko: "호출어 로딩...",
		en: "Loading triggers...", ja: "Loading triggers...", zh: "Loading triggers...", fr: "Loading triggers...", de: "Loading triggers...", ru: "Loading triggers...", es: "Loading triggers...", ar: "Loading triggers...", hi: "Loading triggers...", bn: "Loading triggers...", pt: "Loading triggers...", id: "Loading triggers...", vi: "Loading triggers...",
	},

	// Agents tab (Phase 6)
	"agents.tabAgents": { ko: "에이전트", en: "Agents", ja: "Agents", zh: "Agents", fr: "Agents", de: "Agents", ru: "Agents", es: "Agents", ar: "Agents", hi: "Agents", bn: "Agents", pt: "Agents", id: "Agents", vi: "Agents" },
	"agents.agentsTitle": { ko: "에이전트 목록", en: "Agents", ja: "Agents", zh: "Agents", fr: "Agents", de: "Agents", ru: "Agents", es: "Agents", ar: "Agents", hi: "Agents", bn: "Agents", pt: "Agents", id: "Agents", vi: "Agents" },
	"agents.sessionsTitle": {
		ko: "서브에이전트 세션",
		en: "Sub-agent Sessions", ja: "Sub-agent Sessions", zh: "Sub-agent Sessions", fr: "Sub-agent Sessions", de: "Sub-agent Sessions", ru: "Sub-agent Sessions", es: "Sub-agent Sessions", ar: "Sub-agent Sessions", hi: "Sub-agent Sessions", bn: "Sub-agent Sessions", pt: "Sub-agent Sessions", id: "Sub-agent Sessions", vi: "Sub-agent Sessions",
	},
	"agents.loading": {
		ko: "에이전트 로딩 중...",
		en: "Loading agents...", ja: "Loading agents...", zh: "Loading agents...", fr: "Loading agents...", de: "Loading agents...", ru: "Loading agents...", es: "Loading agents...", ar: "Loading agents...", hi: "Loading agents...", bn: "Loading agents...", pt: "Loading agents...", id: "Loading agents...", vi: "Loading agents...",
	},
	"agents.error": { ko: "오류", en: "Error", ja: "Error", zh: "Error", fr: "Error", de: "Error", ru: "Error", es: "Error", ar: "Error", hi: "Error", bn: "Error", pt: "Error", id: "Error", vi: "Error" },
	"agents.refresh": { ko: "새로고침", en: "Refresh", ja: "Refresh", zh: "Refresh", fr: "Refresh", de: "Refresh", ru: "Refresh", es: "Refresh", ar: "Refresh", hi: "Refresh", bn: "Refresh", pt: "Refresh", id: "Refresh", vi: "Refresh" },
	"agents.noAgents": { ko: "등록된 에이전트 없음", en: "No agents found", ja: "No agents found", zh: "No agents found", fr: "No agents found", de: "No agents found", ru: "No agents found", es: "No agents found", ar: "No agents found", hi: "No agents found", bn: "No agents found", pt: "No agents found", id: "No agents found", vi: "No agents found" },
	"agents.noSessions": {
		ko: "서브에이전트 세션 없음",
		en: "No sub-agent sessions", ja: "No sub-agent sessions", zh: "No sub-agent sessions", fr: "No sub-agent sessions", de: "No sub-agent sessions", ru: "No sub-agent sessions", es: "No sub-agent sessions", ar: "No sub-agent sessions", hi: "No sub-agent sessions", bn: "No sub-agent sessions", pt: "No sub-agent sessions", id: "No sub-agent sessions", vi: "No sub-agent sessions",
	},
	"agents.compact": { ko: "압축", en: "Compact", ja: "Compact", zh: "Compact", fr: "Compact", de: "Compact", ru: "Compact", es: "Compact", ar: "Compact", hi: "Compact", bn: "Compact", pt: "Compact", id: "Compact", vi: "Compact" },
	"agents.deleteSession": { ko: "삭제", en: "Delete", ja: "Delete", zh: "Delete", fr: "Delete", de: "Delete", ru: "Delete", es: "Delete", ar: "Delete", hi: "Delete", bn: "Delete", pt: "Delete", id: "Delete", vi: "Delete" },
	"agents.deleteSessionConfirm": {
		ko: "이 세션을 삭제하시겠습니까?",
		en: "Delete this session?", ja: "Delete this session?", zh: "Delete this session?", fr: "Delete this session?", de: "Delete this session?", ru: "Delete this session?", es: "Delete this session?", ar: "Delete this session?", hi: "Delete this session?", bn: "Delete this session?", pt: "Delete this session?", id: "Delete this session?", vi: "Delete this session?",
	},
	"agents.gatewayRequired": {
		ko: "Gateway 연결이 필요합니다. 설정에서 Gateway URL을 확인하세요.",
		en: "Gateway connection required. Check Gateway URL in settings.", ja: "Gateway connection required. Check Gateway URL in settings.", zh: "Gateway connection required. Check Gateway URL in settings.", fr: "Gateway connection required. Check Gateway URL in settings.", de: "Gateway connection required. Check Gateway URL in settings.", ru: "Gateway connection required. Check Gateway URL in settings.", es: "Gateway connection required. Check Gateway URL in settings.", ar: "Gateway connection required. Check Gateway URL in settings.", hi: "Gateway connection required. Check Gateway URL in settings.", bn: "Gateway connection required. Check Gateway URL in settings.", pt: "Gateway connection required. Check Gateway URL in settings.", id: "Gateway connection required. Check Gateway URL in settings.", vi: "Gateway connection required. Check Gateway URL in settings.",
	},
	"agents.filesTitle": { ko: "에이전트 파일", en: "Agent Files", ja: "Agent Files", zh: "Agent Files", fr: "Agent Files", de: "Agent Files", ru: "Agent Files", es: "Agent Files", ar: "Agent Files", hi: "Agent Files", bn: "Agent Files", pt: "Agent Files", id: "Agent Files", vi: "Agent Files" },
	"agents.filesEmpty": { ko: "파일 없음", en: "No files", ja: "No files", zh: "No files", fr: "No files", de: "No files", ru: "No files", es: "No files", ar: "No files", hi: "No files", bn: "No files", pt: "No files", id: "No files", vi: "No files" },
	"agents.filesLoading": { ko: "파일 로딩 중...", en: "Loading files...", ja: "Loading files...", zh: "Loading files...", fr: "Loading files...", de: "Loading files...", ru: "Loading files...", es: "Loading files...", ar: "Loading files...", hi: "Loading files...", bn: "Loading files...", pt: "Loading files...", id: "Loading files...", vi: "Loading files..." },
	"agents.filesSave": { ko: "저장", en: "Save", ja: "Save", zh: "Save", fr: "Save", de: "Save", ru: "Save", es: "Save", ar: "Save", hi: "Save", bn: "Save", pt: "Save", id: "Save", vi: "Save" },
	"agents.filesSaved": { ko: "저장됨!", en: "Saved!", ja: "Saved!", zh: "Saved!", fr: "Saved!", de: "Saved!", ru: "Saved!", es: "Saved!", ar: "Saved!", hi: "Saved!", bn: "Saved!", pt: "Saved!", id: "Saved!", vi: "Saved!" },
	"agents.filesFailed": { ko: "저장 실패", en: "Save failed", ja: "Save failed", zh: "Save failed", fr: "Save failed", de: "Save failed", ru: "Save failed", es: "Save failed", ar: "Save failed", hi: "Save failed", bn: "Save failed", pt: "Save failed", id: "Save failed", vi: "Save failed" },

	// Diagnostics tab
	"diagnostics.tabDiagnostics": { ko: "진단", en: "Diagnostics", ja: "Diagnostics", zh: "Diagnostics", fr: "Diagnostics", de: "Diagnostics", ru: "Diagnostics", es: "Diagnostics", ar: "Diagnostics", hi: "Diagnostics", bn: "Diagnostics", pt: "Diagnostics", id: "Diagnostics", vi: "Diagnostics" },
	"diagnostics.gatewayStatus": { ko: "Gateway 상태", en: "Gateway Status", ja: "Gateway Status", zh: "Gateway Status", fr: "Gateway Status", de: "Gateway Status", ru: "Gateway Status", es: "Gateway Status", ar: "Gateway Status", hi: "Gateway Status", bn: "Gateway Status", pt: "Gateway Status", id: "Gateway Status", vi: "Gateway Status" },
	"diagnostics.connected": { ko: "연결됨", en: "Connected", ja: "Connected", zh: "Connected", fr: "Connected", de: "Connected", ru: "Connected", es: "Connected", ar: "Connected", hi: "Connected", bn: "Connected", pt: "Connected", id: "Connected", vi: "Connected" },
	"diagnostics.disconnected": { ko: "연결 안 됨", en: "Disconnected", ja: "Disconnected", zh: "Disconnected", fr: "Disconnected", de: "Disconnected", ru: "Disconnected", es: "Disconnected", ar: "Disconnected", hi: "Disconnected", bn: "Disconnected", pt: "Disconnected", id: "Disconnected", vi: "Disconnected" },
	"diagnostics.version": { ko: "버전", en: "Version", ja: "Version", zh: "Version", fr: "Version", de: "Version", ru: "Version", es: "Version", ar: "Version", hi: "Version", bn: "Version", pt: "Version", id: "Version", vi: "Version" },
	"diagnostics.uptime": { ko: "가동 시간", en: "Uptime", ja: "Uptime", zh: "Uptime", fr: "Uptime", de: "Uptime", ru: "Uptime", es: "Uptime", ar: "Uptime", hi: "Uptime", bn: "Uptime", pt: "Uptime", id: "Uptime", vi: "Uptime" },
	"diagnostics.methods": { ko: "사용 가능 메서드", en: "Available Methods", ja: "Available Methods", zh: "Available Methods", fr: "Available Methods", de: "Available Methods", ru: "Available Methods", es: "Available Methods", ar: "Available Methods", hi: "Available Methods", bn: "Available Methods", pt: "Available Methods", id: "Available Methods", vi: "Available Methods" },
	"diagnostics.loading": { ko: "상태 확인 중...", en: "Checking status...", ja: "Checking status...", zh: "Checking status...", fr: "Checking status...", de: "Checking status...", ru: "Checking status...", es: "Checking status...", ar: "Checking status...", hi: "Checking status...", bn: "Checking status...", pt: "Checking status...", id: "Checking status...", vi: "Checking status..." },
	"diagnostics.error": { ko: "상태 확인 실패", en: "Failed to check status", ja: "Failed to check status", zh: "Failed to check status", fr: "Failed to check status", de: "Failed to check status", ru: "Failed to check status", es: "Failed to check status", ar: "Failed to check status", hi: "Failed to check status", bn: "Failed to check status", pt: "Failed to check status", id: "Failed to check status", vi: "Failed to check status" },
	"diagnostics.refresh": { ko: "새로고침", en: "Refresh", ja: "Refresh", zh: "Refresh", fr: "Refresh", de: "Refresh", ru: "Refresh", es: "Refresh", ar: "Refresh", hi: "Refresh", bn: "Refresh", pt: "Refresh", id: "Refresh", vi: "Refresh" },
	"diagnostics.logsTitle": { ko: "실시간 로그", en: "Live Logs", ja: "Live Logs", zh: "Live Logs", fr: "Live Logs", de: "Live Logs", ru: "Live Logs", es: "Live Logs", ar: "Live Logs", hi: "Live Logs", bn: "Live Logs", pt: "Live Logs", id: "Live Logs", vi: "Live Logs" },
	"diagnostics.logsEmpty": { ko: "로그 없음", en: "No logs", ja: "No logs", zh: "No logs", fr: "No logs", de: "No logs", ru: "No logs", es: "No logs", ar: "No logs", hi: "No logs", bn: "No logs", pt: "No logs", id: "No logs", vi: "No logs" },
	"diagnostics.logsTailing": { ko: "로그 수신 중...", en: "Tailing logs...", ja: "Tailing logs...", zh: "Tailing logs...", fr: "Tailing logs...", de: "Tailing logs...", ru: "Tailing logs...", es: "Tailing logs...", ar: "Tailing logs...", hi: "Tailing logs...", bn: "Tailing logs...", pt: "Tailing logs...", id: "Tailing logs...", vi: "Tailing logs..." },
	"diagnostics.logsStart": { ko: "로그 시작", en: "Start Logs", ja: "Start Logs", zh: "Start Logs", fr: "Start Logs", de: "Start Logs", ru: "Start Logs", es: "Start Logs", ar: "Start Logs", hi: "Start Logs", bn: "Start Logs", pt: "Start Logs", id: "Start Logs", vi: "Start Logs" },
	"diagnostics.logsStop": { ko: "로그 중지", en: "Stop Logs", ja: "Stop Logs", zh: "Stop Logs", fr: "Stop Logs", de: "Stop Logs", ru: "Stop Logs", es: "Stop Logs", ar: "Stop Logs", hi: "Stop Logs", bn: "Stop Logs", pt: "Stop Logs", id: "Stop Logs", vi: "Stop Logs" },
	"diagnostics.logsClear": { ko: "로그 초기화", en: "Clear Logs", ja: "Clear Logs", zh: "Clear Logs", fr: "Clear Logs", de: "Clear Logs", ru: "Clear Logs", es: "Clear Logs", ar: "Clear Logs", hi: "Clear Logs", bn: "Clear Logs", pt: "Clear Logs", id: "Clear Logs", vi: "Clear Logs" },

	// Device pairing (in Settings)
	"settings.deviceSection": { ko: "디바이스 페어링", en: "Device Pairing", ja: "Device Pairing", zh: "Device Pairing", fr: "Device Pairing", de: "Device Pairing", ru: "Device Pairing", es: "Device Pairing", ar: "Device Pairing", hi: "Device Pairing", bn: "Device Pairing", pt: "Device Pairing", id: "Device Pairing", vi: "Device Pairing" },
	"settings.deviceHint": {
		ko: "Gateway와 연결된 노드(디바이스)를 관리합니다.",
		en: "Manage nodes (devices) connected to Gateway.", ja: "Manage nodes (devices) connected to Gateway.", zh: "Manage nodes (devices) connected to Gateway.", fr: "Manage nodes (devices) connected to Gateway.", de: "Manage nodes (devices) connected to Gateway.", ru: "Manage nodes (devices) connected to Gateway.", es: "Manage nodes (devices) connected to Gateway.", ar: "Manage nodes (devices) connected to Gateway.", hi: "Manage nodes (devices) connected to Gateway.", bn: "Manage nodes (devices) connected to Gateway.", pt: "Manage nodes (devices) connected to Gateway.", id: "Manage nodes (devices) connected to Gateway.", vi: "Manage nodes (devices) connected to Gateway.",
	},
	"settings.deviceLoading": {
		ko: "디바이스 로딩 중...",
		en: "Loading devices...", ja: "Loading devices...", zh: "Loading devices...", fr: "Loading devices...", de: "Loading devices...", ru: "Loading devices...", es: "Loading devices...", ar: "Loading devices...", hi: "Loading devices...", bn: "Loading devices...", pt: "Loading devices...", id: "Loading devices...", vi: "Loading devices...",
	},
	"settings.deviceEmpty": { ko: "페어링된 디바이스 없음", en: "No paired devices", ja: "No paired devices", zh: "No paired devices", fr: "No paired devices", de: "No paired devices", ru: "No paired devices", es: "No paired devices", ar: "No paired devices", hi: "No paired devices", bn: "No paired devices", pt: "No paired devices", id: "No paired devices", vi: "No paired devices" },
	"settings.deviceApprove": { ko: "승인", en: "Approve", ja: "Approve", zh: "Approve", fr: "Approve", de: "Approve", ru: "Approve", es: "Approve", ar: "Approve", hi: "Approve", bn: "Approve", pt: "Approve", id: "Approve", vi: "Approve" },
	"settings.deviceReject": { ko: "거부", en: "Reject", ja: "Reject", zh: "Reject", fr: "Reject", de: "Reject", ru: "Reject", es: "Reject", ar: "Reject", hi: "Reject", bn: "Reject", pt: "Reject", id: "Reject", vi: "Reject" },
	"settings.devicePending": { ko: "대기 중", en: "Pending", ja: "Pending", zh: "Pending", fr: "Pending", de: "Pending", ru: "Pending", es: "Pending", ar: "Pending", hi: "Pending", bn: "Pending", pt: "Pending", id: "Pending", vi: "Pending" },
	"settings.devicePairRequests": {
		ko: "페어링 요청",
		en: "Pair Requests", ja: "Pair Requests", zh: "Pair Requests", fr: "Pair Requests", de: "Pair Requests", ru: "Pair Requests", es: "Pair Requests", ar: "Pair Requests", hi: "Pair Requests", bn: "Pair Requests", pt: "Pair Requests", id: "Pair Requests", vi: "Pair Requests",
	},
	"settings.deviceNoPairRequests": {
		ko: "대기 중인 요청 없음",
		en: "No pending requests", ja: "No pending requests", zh: "No pending requests", fr: "No pending requests", de: "No pending requests", ru: "No pending requests", es: "No pending requests", ar: "No pending requests", hi: "No pending requests", bn: "No pending requests", pt: "No pending requests", id: "No pending requests", vi: "No pending requests",
	},
} as const;

type TranslationKey = keyof typeof translations;

let currentLocale: Locale = detectLocale();

function detectLocale(): Locale {
	// Check saved config first
	try {
		const raw = localStorage.getItem("naia-config");
		if (raw) {
			const config = JSON.parse(raw);
			if (["ko", "en", "ja", "zh", "fr", "de", "ru", "es", "ar", "hi", "bn", "pt", "id", "vi"].includes(config.locale)) {
				return config.locale;
			}
		}
	} catch {
		// ignore
	}

	// Fall back to OS/browser language
	const lang = navigator.language.toLowerCase();
	const code = lang.split("-")[0];
	if (["ko", "ja", "zh", "fr", "de", "ru", "es", "ar", "hi", "bn", "pt", "id", "vi"].includes(code)) return code as Locale;
	return "en";
}

export function getLocale(): Locale {
	return currentLocale;
}

export function setLocale(locale: Locale): void {
	currentLocale = locale;
}

export function t(key: TranslationKey): string {
	return translations[key][currentLocale];
}
