import { chromium } from "@playwright/test";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

const PORT = 3000;
const URL_BASE = `http://localhost:${PORT}/capture.html`;
const avatarsDir = path.join(process.cwd(), "public", "avatars");

async function main() {
    const files = fs.readdirSync(avatarsDir).filter(f => f.endsWith(".vrm"));
    console.log(`Found ${files.length} VRMs to capture.`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    for (const file of files) {
        const vrmUrl = `/avatars/${file}`;
        const targetUrl = `${URL_BASE}?vrm=${encodeURIComponent(vrmUrl)}`;
        console.log(`Navigating to ${targetUrl}`);
        
        await page.goto(targetUrl);
        
        try {
            await page.waitForFunction(() => window.__RENDERED === true || window.__RENDER_ERROR, { timeout: 10000 });
            
            const error = await page.evaluate(() => window.__RENDER_ERROR);
            if (error) {
                console.error(`Failed to load ${file}:`, error);
                continue;
            }

            // Wait a brief moment for materials to fully compile
            await page.waitForTimeout(500);

            const pngPath = path.join(avatarsDir, file.replace(".vrm", ".png"));
            await page.screenshot({ path: pngPath, clip: { x: 0, y: 0, width: 400, height: 400 } });
            console.log(`Captured ${pngPath}`);

            const webpPath = path.join(avatarsDir, file.replace(".vrm", ".webp"));
            await new Promise((resolve) => {
                exec(`cwebp -q 80 "${pngPath}" -o "${webpPath}"`, (err) => {
                    if (err) {
                        console.error("cwebp error:", err);
                    } else {
                        console.log(`Converted to ${webpPath}`);
                        fs.unlinkSync(pngPath);
                    }
                    resolve();
                });
            });

        } catch (e) {
            console.error(`Timeout or error while capturing ${file}:`, e);
        }
    }

    await browser.close();
    console.log("All captures complete.");
}

main().catch(console.error);
