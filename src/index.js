import fs from "fs";
import path from "path";
import pc from "picocolors";
import { getAudioDir, getDataDir } from "./system/config.js";
import { loadCapabilities } from "./memory/memory.js";
import { startDiaryCron } from "./system/diary.js";
import { state } from "./core/state.js";
import { startServer } from "./system/server.js";
import { handleUserInput } from "./core/orchestrator.js";
import {
  get_active_window,
  toolEvents,
  capture_screen,
} from "./tools/tools.js";

const noaDir = getDataDir();
if (!fs.existsSync(noaDir)) {
  fs.mkdirSync(noaDir, { recursive: true });
}
const envPath = path.join(noaDir, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  const match = envContent.match(/OPENROUTER_API_KEY="?(.*?)"?(?:\n|$)/);
  if (match) process.env.OPENROUTER_API_KEY = match[1];
}

// Robustly set the project root by resolving the audio directory
const audioDir = getAudioDir();
if (fs.existsSync(audioDir)) {
  process.chdir(path.join(audioDir, ".."));
} else {
  console.warn(
    pc.yellow(
      "[ Warning ] Could not locate 'audio' directory. Audio features may not work.",
    ),
  );
}

console.clear();
console.log(pc.cyanBright("[ System ] Booting Noa-chan Backend Server..."));

await state.init();

const capabilities = loadCapabilities();
if (capabilities.length === 0) {
  console.log(pc.red("[ Error ] Missing capabilities.json!"));
  process.exit(1);
}

startDiaryCron();

if (state.getMemory().length > 0) {
  console.log(
    pc.cyan(`[ System ] Loaded ${state.getMemory().length} previous memories.`),
  );
}

setInterval(async () => {
  const currentWs = state.getWs();
  if (!currentWs) return;

  const { loadSettings } = await import("./memory/memory.js");
  const settings = await loadSettings();
  if (
    settings.proactiveMode === false ||
    String(settings.proactiveMode).toLowerCase() === "false"
  )
    return;

  const interval = settings.proactiveInterval || 5;
  const idleMinutes = (Date.now() - state.lastInteractionTime) / (1000 * 60);

  if (idleMinutes >= interval) {
    state.updateLastInteraction(); // Reset to prevent spamming
    try {
      const activeWindow = await get_active_window();

      const memory = state.getMemory();
      const lastUserMessage =
        memory
          .slice(-5)
          .reverse()
          .find((m) => m.role === "user")?.content || "";
      const affinity = state.getAffinity();
      const temperature = state.getTemperature();

      const proactivePrompt = `*[SYSTEM EVENT: Spontaneous Thought] You haven't spoken to Sensei in ${interval} minutes. Sensei's active window is currently: "${activeWindow}". 
YOUR CURRENT STATE:
- Your affinity with Sensei is ${affinity}/100.
- Your emotional temperature is "${temperature}".
- The last thing Sensei said to you was: "${lastUserMessage}"
${affinity > 70 ? "- You feel close to Sensei and are more likely to be warm and playful." : ""}
${affinity < 30 ? "- You feel distant. Be respectful and not overly forward." : ""}

Initiate a short, natural conversation. Reference something specific if you can. Keep it brief (1-2 sentences) but warm. Do not monologue. If you're unsure what to say, a simple check-in is always appropriate.]*`;

      console.log(
        pc.whiteBright(
          `\n[ System Trigger ] Proactive check-in (Window: ${activeWindow})`,
        ),
      );
      await handleUserInput(proactivePrompt, currentWs, true);
    } catch (e) {
      console.error("[ System ] Proactive check-in failed:", e.message);
    }
  }
}, 60 * 1000);

// Focus Monitor Loop (Every 30 seconds)
setInterval(async () => {
  const currentWs = state.getWs();
  if (!currentWs || state.getFocusEndTime() < Date.now()) return;

  // Check if she scolded recently (2 mins cooldown)
  if (Date.now() - state.getLastScoldTime() < 120000) return;

  try {
    const activeWindow = await get_active_window();
    const distractedKeywords = [
      "youtube",
      "steam",
      "reddit",
      "discord",
      "twitter",
      "game",
    ];
    const isDistracted = distractedKeywords.some((kw) =>
      activeWindow.toLowerCase().includes(kw),
    );

    if (isDistracted) {
      state.setLastScoldTime(Date.now());
      const concernPrompt = `*[SYSTEM EVENT: Focus Check] Sensei is in Focus Mode but their active window is "${activeWindow}".
React in character: you care about Sensei's goals and noticed they're distracted.
Gently check in — don't scold. Express soft concern. Maybe tease lightly.
Keep it to 1-2 sentences. Reveal a little warmth, not frustration.]*`;
      console.log(
        pc.redBright(
          `\n[ System Trigger ] Focus Breach Detected: ${activeWindow}`,
        ),
      );
      await handleUserInput(concernPrompt, currentWs, true);
    }
  } catch (e) {
    console.error("[ System ] Focus monitor failed:", e.message);
  }
}, 30 * 1000);

// Watch-Along Mode Loop (Every 2 minutes)
setInterval(async () => {
  const currentWs = state.getWs();
  if (!currentWs || !state.getIsWatching()) return;

  try {
    const screenshotResult = await capture_screen();
    if (
      typeof screenshotResult === "string" &&
      screenshotResult.includes("__is_image")
    ) {
      const imgData = JSON.parse(screenshotResult);
      const watchPrompt = [
        {
          type: "text",
          text: "*[SYSTEM EVENT: Watch-Along Mode] Sensei is watching something. Here is a screenshot of their screen. Drop a spontaneous, brief comment about what's happening!*",
        },
        { type: "image_url", image_url: { url: imgData.base64 } },
      ];
      console.log(
        pc.magentaBright(`\n[ System Trigger ] Watch-Along check-in`),
      );
      await handleUserInput(watchPrompt, currentWs, true);
    }
  } catch (e) {
    console.error("[ System ] Watch-along failed:", e.message);
  }
}, 120 * 1000);

toolEvents.on("timer_finished", async (message) => {
  const currentWs = state.getWs();
  if (currentWs) {
    const timerPrompt = `*[SYSTEM EVENT: Timer Finished] Sensei's timer has finished. Alert them immediately. Reminder message: "${message}"*`;
    console.log(
      pc.whiteBright(`\n[ System Trigger ] Timer finished: ${message}`),
    );
    await handleUserInput(timerPrompt, currentWs);
  }
});

startServer();
