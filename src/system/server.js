import fs from "fs";
import path from "path";
import pc from "picocolors";
import { Elysia } from "elysia";
import { loadSettings, saveSettings, saveMemory } from "../memory/memory.js";
import { getDataDir, setDataDir, getAudioDir } from "./config.js";
import { state } from "../core/state.js";
import { handleUserInput, cancelActiveRequest } from "../core/orchestrator.js";
import * as tools from "../tools/tools.js";
import { toolEvents } from "../tools/tools.js";

export const pendingApprovals = new Map();
let hasSentLoginGreeting = false;

export function sendToFrontend(ws, typeOrRole, dataOrContent) {
  if (ws && ws.readyState === 1) {
    const isMessageRole = ['system', 'noa', 'tool', 'user', 'assistant'].includes(typeOrRole);
    if (isMessageRole) {
      state.updateLastInteraction();
      if (typeof dataOrContent === "string") {
          ws.send(JSON.stringify({ type: "message", role: typeOrRole, content: dataOrContent }));
      } else {
          ws.send(JSON.stringify({ type: "message", role: typeOrRole, content: dataOrContent.content, requestId: dataOrContent.requestId }));
      }
    } else {
      ws.send(JSON.stringify({
        type: typeOrRole,
        ...(typeof dataOrContent === "string" ? { content: dataOrContent } : dataOrContent)
      }));
    }
  }
}

const noaDir = getDataDir();

toolEvents.on("sync_todos", async () => {
  const ws = state.getWs();
  if (ws && ws.readyState === 1) {
    const settings = await loadSettings();
    ws.send(
      JSON.stringify({
        type: "sync_todos",
        todos: tools.get_all_todos_raw(),
        level: settings.level || 1,
        exp: settings.exp || 0,
      }),
    );
  }
});

toolEvents.on("trigger_ai", async (prompt) => {
  const ws = state.getWs();
  if (ws && ws.readyState === 1) {
    console.log(pc.whiteBright(`\n${prompt}`));
    await handleUserInput(prompt, ws, true);
  }
});

toolEvents.on("start_rps", () => {
  const ws = state.getWs();
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "start_rps" }));
  }
});

// Merged into the above definition

const MESSAGE_HANDLERS = {
  init: async (data, ws) => {
    await handleSettings(data, ws);
    if (data.apiKey && !hasSentLoginGreeting) {
      try {
        const loginAudioPath = path.join(getAudioDir(), "login_audio.json");
        const loginAudioData = JSON.parse(
          fs.readFileSync(loginAudioPath, "utf8"),
        );
        const randomGreeting =
          loginAudioData[Math.floor(Math.random() * loginAudioData.length)];

        ws.send(
          JSON.stringify({
            type: "login_greeting",
            text: randomGreeting.text,
            audio: randomGreeting.audio,
          }),
        );

        const memory = state.getMemory();
        memory.push({ role: "assistant", content: randomGreeting.text });
        state.setMemory(memory);
        saveMemory(memory);
        hasSentLoginGreeting = true;
      } catch (err) {
        console.error("Failed to load login audio:", err);
      }
    }
  },
  approval_response: async (data, ws) => {
    const resolve = pendingApprovals.get(data.id);
    if (resolve) {
      resolve(data.approved);
      pendingApprovals.delete(data.id);
    }
  },
  settings: async (data, ws) => {
    await handleSettings(data, ws);
    if (data.apiKey) {
      const prompt =
        "*[SYSTEM EVENT] Noa, sensei is looking for you, are you there?*";
      console.log(pc.whiteBright(`\n[ System Trigger ] ${prompt}`));
      await handleUserInput(prompt, ws, true);
    }
  },
  get_core_memory: async (data, ws) => {
    const memFile = path.join(getDataDir(), "long_term_memory.txt");
    const content = fs.existsSync(memFile)
      ? fs.readFileSync(memFile, "utf8")
      : "";
    ws.send(JSON.stringify({ type: "core_memory_data", content }));
  },
  save_core_memory: async (data, ws) => {
    const memFile = path.join(getDataDir(), "long_term_memory.txt");
    fs.writeFileSync(memFile, data.content || "", "utf8");
    console.log(
      pc.greenBright("[ System ] Core memory updated from frontend."),
    );
  },
  input: async (data, ws) => {
    state.updateLastInteraction();
    console.log(pc.whiteBright(`\n[ Sensei ] ${data.content}`));
    await handleUserInput(data.content, ws, false, data.requestId);
  },
  cancel_request: async (data, ws) => {
    cancelActiveRequest(data.requestId);
  },
  rps_choice: async (data, ws) => {
    const choices = ["rock", "paper", "scissors"];
    const noaChoice = choices[Math.floor(Math.random() * choices.length)];
    const userChoice = data.choice.toLowerCase();

    let winner = "draw";
    if (userChoice === noaChoice) winner = "draw";
    else if (
      (userChoice === "rock" && noaChoice === "scissors") ||
      (userChoice === "paper" && noaChoice === "rock") ||
      (userChoice === "scissors" && noaChoice === "paper")
    ) {
      winner = "sensei";
    } else {
      winner = "noa";
    }

    const settings = await loadSettings();
    if (!settings.rpsScore) settings.rpsScore = { noa: 0, sensei: 0 };
    if (winner === "noa") settings.rpsScore.noa += 1;
    else if (winner === "sensei") settings.rpsScore.sensei += 1;
    await saveSettings(settings);

    ws.send(
      JSON.stringify({
        type: "rps_reveal",
        user: userChoice,
        noa: noaChoice,
        winner: winner,
      }),
    );

    let prompt = `*[SYSTEM EVENT: You played Rock Paper Scissors. Sensei chose ${userChoice}, you chose ${noaChoice}. `;
    if (winner === "draw") prompt += `It's a draw! `;
    else if (winner === "noa") prompt += `You win! `;
    else prompt += `Sensei wins! `;
    prompt += `Current Score - Noa: ${settings.rpsScore.noa}, Sensei: ${settings.rpsScore.sensei}. React to the result playfully!]*`;

    console.log(pc.whiteBright(`\n[ System Trigger ] ${prompt}`));
    await handleUserInput(prompt, ws, true);
  },
  trigger_notification: async (data, ws) => {
    if (tools.send_notification) {
      tools.send_notification({ title: data.title, message: data.message });
    }
  },
};

async function handleSettings(data, ws) {
  const noaDir = getDataDir();
  process.env.OPENROUTER_API_KEY = data.apiKey;
  if (data.apiKey) {
    fs.writeFileSync(
      path.join(noaDir, ".env"),
      `OPENROUTER_API_KEY="${data.apiKey}"`,
    );
    console.log(pc.greenBright("[ System ] API Key injected and persisted."));
  }

  const currentSettings = await loadSettings();
  if (data.userName) currentSettings.userName = data.userName;
  if (data.city) currentSettings.city = data.city;
  if (data.proactiveMode !== undefined) {
    currentSettings.proactiveMode = data.proactiveMode === true || data.proactiveMode === 'true' || data.proactiveMode === 'on';
  }
  if (data.proactiveInterval !== undefined)
    currentSettings.proactiveInterval = data.proactiveInterval;
  if (data.models && Array.isArray(data.models) && data.models.length > 0)
    currentSettings.models = data.models;
  await saveSettings(currentSettings);

  if (
    data.storageDir &&
    path.resolve(data.storageDir).toLowerCase() !==
      path.resolve(noaDir).toLowerCase()
  ) {
    console.log(
      pc.yellowBright(
        `\n[ System ] Storage directory change detected. Migrating to ${data.storageDir}...`,
      ),
    );
    try {
      if (!fs.existsSync(data.storageDir))
        fs.mkdirSync(data.storageDir, { recursive: true });

      const filesToMove = [
        "memory.json",
        "long_term_memory.txt",
        "settings.json",
        ".env",
        "todos.json",
        "vector_memory.json",
      ];
      for (const file of filesToMove) {
        const oldPath = path.join(noaDir, file);
        const newPath = path.join(data.storageDir, file);
        if (fs.existsSync(oldPath)) fs.copyFileSync(oldPath, newPath);
      }

      if (fs.existsSync(path.join(noaDir, "models"))) {
        fs.cpSync(
          path.join(noaDir, "models"),
          path.join(data.storageDir, "models"),
          { recursive: true },
        );
      }
      if (fs.existsSync(path.join(process.cwd(), "diary"))) {
        fs.cpSync(
          path.join(process.cwd(), "diary"),
          path.join(data.storageDir, "diary"),
          { recursive: true },
        );
      }

      setDataDir(data.storageDir);
      console.log(
        pc.greenBright("[ System ] Migration complete. Restarting backend..."),
      );

      ws.send(
        JSON.stringify({
          type: "message",
          role: "system",
          content:
            "Storage directory changed successfully. Please restart the application for changes to take effect.",
        }),
      );

      setTimeout(() => process.exit(0), 1000);
      return;
    } catch (e) {
      console.error(pc.redBright(`[ System ] Migration failed: ${e.message}`));
      ws.send(
        JSON.stringify({
          type: "message",
          role: "system",
          content: `Storage migration failed: ${e.message}`,
        }),
      );
    }
  }

  const s = await loadSettings();
  ws.send(
    JSON.stringify({
      type: "sync_todos",
      todos: tools.get_all_todos_raw(),
      level: s.level || 1,
      exp: s.exp || 0,
      models: s.models || [],
    }),
  );
}

export function startServer() {
  let expectedToken = process.env.NOA_AUTH_TOKEN;
  if (!expectedToken) {
    expectedToken = crypto.randomUUID();
    console.warn(
      pc.yellow(
        "[ System ] WARNING: NOA_AUTH_TOKEN is not set (running outside Tauri?).",
      ),
    );
    console.warn(
      pc.yellow(`[ System ] Generated temporary dev token: ${expectedToken}`),
    );
  }

  const app = new Elysia()
    .onBeforeHandle(({ query, set }) => {
      if (query.token !== expectedToken) {
        set.status = 401;
        return "Unauthorized";
      }
    })
    .get("/audio/*", ({ params, set }) => {
      const requestedPath = path.join(getAudioDir(), params["*"]);
      const resolvedAudioDir = path.resolve(getAudioDir());
      const resolvedRequestedPath = path.resolve(requestedPath);
      
      if (!resolvedRequestedPath.startsWith(resolvedAudioDir)) {
          return new Response("Forbidden", { status: 403 });
      }
      
      if (fs.existsSync(resolvedRequestedPath)) {
        return Bun.file(resolvedRequestedPath);
      }
      return new Response("Not found", { status: 404 });
    })
    .get("/", () => "Noa-chan Backend API is running.")
    .ws("/ws", {
      open(ws) {
        console.log(
          pc.cyanBright("[ System ] Desktop Frontend connected via WebSocket."),
        );
        state.setWs(ws);
      },
      async message(ws, message) {
        try {
          const data =
            typeof message === "string" ? JSON.parse(message) : message;
          const handler = MESSAGE_HANDLERS[data.type];
          if (handler) {
            await handler(data, ws);
          } else {
            console.warn(
              pc.yellow(`[ System ] Unknown message type: ${data.type}`),
            );
          }
        } catch (err) {
          console.error("WS Error:", err);
        }
      },
      close(ws) {
        console.log(
          pc.yellowBright("[ System ] Desktop Frontend disconnected."),
        );
        state.setWs(null);
        
        for (const resolve of pendingApprovals.values()) {
            resolve("DISCONNECTED");
        }
        pendingApprovals.clear();

        setTimeout(() => {
          if (!state.getWs()) {
            console.log(
              pc.redBright(
                "[ System ] No active connections. Shutting down orphaned backend...",
              ),
            );
            process.exit(0);
          }
        }, 5000);
      },
    })
    .listen(0);

  console.log(`PORT=${app.server.port}`);
  console.log(
    pc.magentaBright(
      `[ System ] Elysia Backend listening on port ${app.server.port}`,
    ),
  );

  setTimeout(() => {
    if (!state.getWs()) {
      console.log(
        pc.redBright(
          "[ System ] No frontend connection after 60s. Shutting down...",
        ),
      );
      process.exit(0);
    }
  }, 60000);
}
