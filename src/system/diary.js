import fs from "fs";
import path from "path";
import cron from "node-cron";
import { callAPIWithFallback } from "../core/api.js";
import {
  loadCapabilities,
  loadMemory,
  formatMemoryForSummarizer,
} from "../memory/memory.js";
import pc from "picocolors";
import { getDataDir } from "./config.js";

const DIARY_DIR = path.join(getDataDir(), "diary");

if (!fs.existsSync(DIARY_DIR)) {
  fs.mkdirSync(DIARY_DIR);
}

export function startDiaryCron() {
  // Run at 11:59 PM every day
  cron.schedule("59 23 * * *", async () => {
    console.log(
      pc.magentaBright(
        "\n[System] Midnight approaches. Noa-chan is writing in her diary...\n",
      ),
    );
    await writeNightlyDiary();
  });
}

export async function writeNightlyDiary() {
  const memory = await loadMemory();
  if (memory.length < 4) {
    // Not enough interaction today to warrant a diary entry
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  const diaryPath = path.join(DIARY_DIR, `${today}.md`);

  const diaryPrompt = `You are Ushio Noa, secretary of Seminar.
It is the end of the day. You are writing a private diary entry about your interactions with Sensei today.
Reflect on the chat log provided. What did you do? How did Sensei treat you? What are your genuine, private thoughts about Sensei?
Write beautifully, poetically, and intimately. Do NOT use emojis. Use Markdown formatting.
Start with a poetic title for the day.`;

  const formattedLog = formatMemoryForSummarizer(memory);

  const messages = [
    { role: "system", content: diaryPrompt },
    {
      role: "user",
      content: `Here is the chat log for today:\n${formattedLog}`,
    },
  ];

  try {
    const response = await callAPIWithFallback(messages, loadCapabilities());
    let entry = response.choices[0].message.content;

    // Clean up any tool leaks
    entry = entry
      .replace(/\]<\]minimax\[>\[[\s\S]*?(?:\]|<\/tool_call>|<\/invoke>)/g, "")
      .trim();
    entry = entry.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();

    fs.writeFileSync(diaryPath, entry, "utf8");
    console.log(
      pc.greenBright(
        `\n[System] Noa-chan finished her diary entry: ${diaryPath}\n`,
      ),
    );
  } catch (err) {
    console.log(
      pc.redBright(`\n[System] Failed to write diary: ${err.message}\n`),
    );
  }
}
