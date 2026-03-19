import { useState } from "react";


type MetaTab = "bookmarks" | "settings";

interface Bookmark {
	title: string;
	url: string;
}

const BOOKMARKS_KEY = "naia_browser_bookmarks";

function loadBookmarks(): Bookmark[] {
	try {
		return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) ?? "[]");
	} catch {
		return [];
	}
}

function saveBookmarks(bm: Bookmark[]): void {
	localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bm));
}

export function BrowserMetaPanel() {
	const [tab, setTab] = useState<MetaTab>("bookmarks");
	const [bookmarks, setBookmarks] = useState<Bookmark[]>(loadBookmarks);

	function removeBookmark(url: string) {
		const next = bookmarks.filter((b) => b.url !== url);
		setBookmarks(next);
		saveBookmarks(next);
	}

	return (
		<div className="browser-meta">
			<div className="browser-meta__tabs">
				<button
					type="button"
					className={`browser-meta__tab${tab === "bookmarks" ? " browser-meta__tab--active" : ""}`}
					onClick={() => setTab("bookmarks")}
				>
					Bookmarks
				</button>
				<button
					type="button"
					className={`browser-meta__tab${tab === "settings" ? " browser-meta__tab--active" : ""}`}
					onClick={() => setTab("settings")}
				>
					Settings
				</button>
			</div>

			<div className="browser-meta__body">
				{tab === "bookmarks" && (
					<div className="browser-meta__bookmarks">
						{bookmarks.length === 0 ? (
							<p className="browser-meta__empty">No bookmarks yet.</p>
						) : (
							bookmarks.map((b) => (
								<div key={b.url} className="browser-meta__bookmark">
									<span className="browser-meta__bookmark-title" title={b.url}>
										{b.title || b.url}
									</span>
									<button
										type="button"
										className="browser-meta__bookmark-remove"
										onClick={() => removeBookmark(b.url)}
										title="Remove"
									>
										×
									</button>
								</div>
							))
						)}
					</div>
				)}
				{tab === "settings" && (
					<div className="browser-meta__settings">
						<p className="browser-meta__settings-hint">
							Browser settings coming soon.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}

/** Called from BrowserCenterPanel to add a bookmark. */
export function addBookmark(title: string, url: string): void {
	const bm = loadBookmarks();
	if (bm.some((b) => b.url === url)) return;
	const next = [{ title, url }, ...bm];
	saveBookmarks(next);
}
