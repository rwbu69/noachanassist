import pc from "picocolors";
import {
  loadPersona,
  getCircadianMood,
  saveMemory,
  summarizeAndArchive,
  loadSettings,
} from "../memory/memory.js";
import { callAPIWithFallback } from "./api.js";
import {
  saveVectorMemory,
  queryVectorMemory,
} from "../memory/vector_memory.js";
import * as tools from "../tools/tools.js";
import { state } from "./state.js";
import { sendToFrontend, pendingApprovals } from "../system/server.js";
import { handleCommand } from "../tools/commands.js";

export const activeRequests = new Map();

export function cancelActiveRequest(requestId) {
    if (activeRequests.has(requestId)) {
        activeRequests.get(requestId).abort();
        activeRequests.delete(requestId);
    }
}

// SRP: Heuristic to estimate warmth level from recent messages
function estimateWarmthLevel(memory) {
    const recentMessages = memory.slice(-5).filter(m => m.role === 'user').map(m => (typeof m.content === 'string' ? m.content.toLowerCase() : ''));
    if (recentMessages.length === 0) return 'moderate';
    
    const warmKeywords = ['love', 'cute', 'sweet', 'thank you', 'thanks', 'happy', 'smile', 'beautiful', '♡', 'heart', 'dear', 'miss', 'hug', 'warm', 'good girl', 'best'];
    const coldKeywords = ['stop', 'annoying', 'quiet', 'shut up', 'leave', 'busy', 'no', 'bad', 'don\'t', 'nevermind'];
    
    let warmScore = 0;
    let coldScore = 0;
    
    for (const msg of recentMessages) {
        for (const kw of warmKeywords) if (msg.includes(kw)) warmScore++;
        for (const kw of coldKeywords) if (msg.includes(kw)) coldScore++;
    }
    
    if (warmScore > coldScore && warmScore > 0) return 'high';
    if (coldScore > warmScore && coldScore > 0) return 'low';
    return 'moderate';
}

// SRP: Helper to build the system prompt context
async function buildSystemPrompt(userSettings, capabilities, ws, memory) {
  let activePersona =
    (await loadPersona(capabilities, userSettings)) +
    `\n\n${getCircadianMood()}`;

  const now = new Date();
  const dateString = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeString = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const currentTodos = tools.read_todos();

  let weatherStr = "Weather context not available (City not set in settings).";
  if (userSettings.city) {
    weatherStr = await tools
      .executeWithTimeout(tools.get_weather({ city: userSettings.city }), 5000)
      .catch(() => "Weather API unavailable");
  }

  const dailyBriefing = `\n\n[SYSTEM EVENT - CURRENT CONTEXT]\nCurrent Date: ${dateString}\nCurrent Time: ${timeString}\nCurrent Weather in ${userSettings.city || "Unknown"}: ${weatherStr}\nPending Tasks:\n${currentTodos}`;
  activePersona += dailyBriefing;
  
  const affinity = state.getAffinity();
  const temperature = state.getTemperature();
  const warmthLevel = estimateWarmthLevel(memory || []);
  let minutesSince = Math.round((Date.now() - state.lastInteractionTime) / 60000);
  if (minutesSince < 0) minutesSince = 0;
  
  const relationshipState = `\n\n[RELATIONSHIP STATE]
Your affinity with Sensei is ${affinity}/100.
Your current emotional temperature is "${temperature}".
${affinity > 70 ? "You feel close to Sensei today. You may be more openly affectionate, playful, and physically proximate in your descriptions." : ""}
${affinity < 30 ? "You feel distant from Sensei. You are more reserved, formal, and less physically expressive. Do not guilt-trip or express abandonment — simply reflect the distance quietly." : ""}
${temperature === 'touched' ? "Something Sensei said or did genuinely affected you. Let that warmth show in your response, subtly." : ""}
${temperature === 'anxious' ? "You are feeling a little anxious. You may be slightly more tentative or ask a gentle clarifying question." : ""}

[CURRENT STATE]
- Time since last interaction: ${minutesSince} minutes
- Sensei's recent warmth level: ${warmthLevel}
${warmthLevel === 'high' ? "- Sensei has been warm and affectionate recently. You may match their energy with playful affection. Keep it contextual and never forced." : ""}
${warmthLevel === 'low' ? "- Sensei has been businesslike or distant recently. Be respectful, warm but not forward, and let them lead on affection." : ""}`;
  
  activePersona += relationshipState;

  const activeGame = state.getActiveGame();
  if (activeGame) {
    activePersona += `\n\n[SYSTEM OVERRIDE - ACTIVE GAME MODE: ${activeGame.toUpperCase()}]\nYou are currently playing a game of ${activeGame} with Sensei. Act as the Game Master/Host for this game. Keep track of the game rules, points, and turns! Treat this as a fun, highly interactive session.`;
  }

  return activePersona;
}

// SRP: Helper to manage human-in-the-loop tool approvals
async function handleToolCall(toolCall, ws, capabilities, memory) {
  const functionName = toolCall.function.name;
  sendToFrontend(ws, "tool", `Executing: ${functionName}...`);

  let functionArgs;
  try {
    functionArgs = JSON.parse(toolCall.function.arguments || "{}");
  } catch (jsonErr) {
    console.log(pc.red(`Tool JSON Error for ${functionName}.`));
    return {
      role: "tool",
      tool_call_id: toolCall.id,
      name: functionName,
      content: JSON.stringify({
        success: false,
        error: `JSON Parse Error: ${jsonErr.message}. Please fix your JSON arguments.`,
      }),
    };
  }

  const toolDef = capabilities.find((c) => c.function.name === functionName);
  if (toolDef && toolDef.function.approval_required) {
    sendToFrontend(ws, "approval_request", {
      id: toolCall.id,
      tool: functionName,
      args: functionArgs,
    });

    const approved = await new Promise((resolve) => {
      pendingApprovals.set(toolCall.id, resolve);
      setTimeout(() => {
        if (pendingApprovals.has(toolCall.id)) {
            pendingApprovals.delete(toolCall.id);
            resolve("TIMEOUT");
        }
      }, 60000);
    });

    if (approved === "TIMEOUT" || approved === "DISCONNECTED") {
        return {
          role: "tool",
          tool_call_id: toolCall.id,
          name: functionName,
          content: JSON.stringify({
            success: false,
            error: `Approval failed: ${approved === "TIMEOUT" ? "User did not respond within 60 seconds." : "Client disconnected before approval."}`
          }),
        };
    }

    if (!approved) {
      return {
        role: "tool",
        tool_call_id: toolCall.id,
        name: functionName,
        content: JSON.stringify({
          success: false,
          error: "User explicitly denied permission to execute this tool.",
        }),
      };
    }
  }

  let functionResult = "";
  if (tools[functionName]) {
    const timeoutMs = tools.TOOL_CONFIG?.[functionName]?.timeout || 60000;
    try {
      functionResult = await tools.executeWithTimeout(
        Promise.resolve(tools[functionName](functionArgs)),
        timeoutMs,
      );
    } catch (e) {
      functionResult = JSON.stringify({
        success: false,
        error: e.message || "Unknown tool execution error",
      });
    }
  } else {
    functionResult = JSON.stringify({
      success: false,
      error: `Tool ${functionName} does not exist.`,
    });
  }

  // Special handling for screen capture to format as vision input
  if (
    typeof functionResult === "string" &&
    functionResult.includes("__is_image")
  ) {
    try {
      const imgData = JSON.parse(functionResult);
      functionResult =
        "Screen captured successfully. See the user message below for the image.";
      // Since this returns multiple messages (tool output + vision input), we return an array
      return [
        {
          role: "tool",
          tool_call_id: toolCall.id,
          name: functionName,
          content: functionResult,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Here is the screenshot you requested:" },
            { type: "image_url", image_url: { url: imgData.base64 } },
          ],
        },
      ];
    } catch (e) {}
  }

  return {
    role: "tool",
    tool_call_id: toolCall.id,
    name: functionName,
    content:
      typeof functionResult === "string"
        ? functionResult
        : JSON.stringify(functionResult),
  };
}

// SRP: Helper to enforce memory character limits (replacing js-tiktoken)
async function enforceContextLimits(memory, maxTokens) {
  const charsPerToken = 4;
  const maxChars = maxTokens * charsPerToken;
  let totalChars = memory.reduce(
    (sum, m) =>
      sum +
      (typeof m.content === "string"
        ? m.content.length
        : JSON.stringify(m.content).length),
    0,
  );

  if (totalChars > maxChars) {
    const summarized = await summarizeAndArchive(memory);
    state.setMemory(summarized);
    return summarized;
  }
  return memory;
}

// Main Orchestrator Loop
export async function handleUserInput(userInput, ws, isSystemTrigger = false, requestId = null) {
  if (typeof userInput === "string") {
    userInput = userInput.trim();
    if (!userInput) return;

    if (userInput.startsWith("/")) {
      const [cmd, ...args] = userInput.split(" ");
      const handled = await handleCommand(cmd.toLowerCase(), args);
      if (handled) {
          if (requestId) sendToFrontend(ws, "request_cancelled", { requestId });
          return;
      } else {
          sendToFrontend(ws, "system", { content: "Unknown command. Type /help to see available commands.", requestId });
          if (requestId) sendToFrontend(ws, "request_cancelled", { requestId });
          return;
      }
    }
  }

  const controller = new AbortController();
  if (requestId) {
      activeRequests.set(requestId, controller);
  }

  let lastDownloadMsg = 0;
  let hasSentLoading = false;
  
  const progressCallback = (info) => {
    if (info.status === "init" || info.status === "download") {
      if (!hasSentLoading) {
        sendToFrontend(ws, "system", "Loading AI Brain...");
        hasSentLoading = true;
      }
      console.log(pc.dim(`[ Vector Engine ] Downloading ${info.file || "weights"}...`));
    } else if (info.status === "progress") {
      const now = Date.now();
      if (now - lastDownloadMsg > 1500) {
        console.log(pc.dim(`[ Vector Engine ] Downloading ${info.file} - ${Math.round(info.progress)}%`));
        lastDownloadMsg = now;
      }
    } else if (info.status === "done") {
      console.log(pc.dim(`[ Vector Engine ] Initialized ${info.file || 'model'} successfully.`));
    }
  };

  let memory = state.getMemory();
  memory.push({ role: "user", content: userInput });

  const userSettings = await loadSettings();
  memory = await enforceContextLimits(
    memory,
    userSettings.maxContextTokens || 8000,
  );
  state.setMemory(memory); // Sync immediately so user sees input in memory if debugged

  try {
    const textToSave =
      typeof userInput === "string" ? userInput : "[Image sent to Noa]";
    await saveVectorMemory(textToSave, "user", progressCallback);
  } catch (e) {
    console.log(pc.red(`Vector memory error: ${e.message}`));
  }

  if (controller.signal.aborted) {
      if (requestId) sendToFrontend(ws, "request_cancelled", { requestId });
      if (requestId) activeRequests.delete(requestId);
      memory.pop();
      state.setMemory(memory);
      return;
  }

  const capabilities = state.getCapabilities();
  let activePersona = await buildSystemPrompt(userSettings, capabilities, ws, memory);

  try {
    const queryText =
      typeof userInput === "string" ? userInput : "What do you see?";
    const relevantMemories = await queryVectorMemory(
      queryText,
      3,
      progressCallback,
    );
    if (relevantMemories.length > 0) {
      const memoryText = relevantMemories
        .map((m) => `[${m.timestamp}] ${m.role}: ${m.text}`)
        .join("\n");
      activePersona += `\n\n[RELEVANT PAST MEMORIES]\n${memoryText}`;
    }
  } catch (e) {
    console.log(pc.red(`Vector memory query error: ${e.message}`));
  }

  if (controller.signal.aborted) {
      if (requestId) sendToFrontend(ws, "request_cancelled", { requestId });
      if (requestId) activeRequests.delete(requestId);
      memory.pop();
      state.setMemory(memory);
      return;
  }

  let networkRetries = 0;
  let iterations = 0;

  while (true) {
    if (iterations++ > 5) {
      sendToFrontend(
        ws,
        "system",
        "Tool execution aborted due to excessive recursive errors.",
      );
      memory.push({
        role: "assistant",
        content:
          "I got stuck in a loop while thinking. Please try asking again.",
      });
      state.setMemory(memory);
      break;
    }

    try {
      let messages = [{ role: "system", content: activePersona }, ...memory];
      const models = userSettings.models || ["openrouter/free"];
      
      sendToFrontend(ws, "system", "Noa-chan is thinking...");

      if (controller.signal.aborted) throw new Error("USER_CANCELLED");
      
      const response = await callAPIWithFallback(
        messages,
        capabilities,
        models,
        {
           abortSignal: controller.signal
        }
      );
      
      const responseMessage = response.choices[0].message;

      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        sendToFrontend(ws, "system", "Noa-chan is checking her tools...");
        memory.push(responseMessage);

        for (const toolCall of responseMessage.tool_calls) {
          if (controller.signal.aborted) throw new Error("USER_CANCELLED");
          const toolResult = await handleToolCall(
            toolCall,
            ws,
            capabilities,
            memory,
          );
          if (controller.signal.aborted) throw new Error("USER_CANCELLED");
          
          if (Array.isArray(toolResult)) {
            memory.push(...toolResult);
          } else {
            memory.push(toolResult);
          }
        }

        state.setMemory(memory);
        continue; // Loop again so LLM processes the tool result
      } else {
        let reply = responseMessage.content
          .replace(
            /\]<\]minimax\[>\[[\s\S]*?(?:\]|<\/tool_call>|<\/invoke>)/g,
            "",
          )
          .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
          .replace(/<invoke>[\s\S]*?<\/invoke>/g, "")
          .trim();

        if (controller.signal.aborted) throw new Error("USER_CANCELLED");

        sendToFrontend(ws, "noa", { content: reply, requestId });
        
        memory.push({ role: "assistant", content: reply });

        await saveMemory(memory);
        state.setMemory(memory);
        await saveVectorMemory(reply, "assistant");
        
        if (requestId) activeRequests.delete(requestId);
        break;
      }
    } catch (error) {
      console.error(pc.red(`[Debug] Orchestrator Loop Error:`), error);
      if (requestId) activeRequests.delete(requestId);
      if (controller.signal.aborted && error.message !== "USER_CANCELLED") {
        if (requestId) sendToFrontend(ws, "request_cancelled", { requestId });
        memory.pop();
        state.setMemory(memory);
        break;
      }
      if (error.message === "CONTEXT_LIMIT") {
        memory = await summarizeAndArchive(memory);
        state.setMemory(memory);
        continue;
      }
      if (error.message === "USER_CANCELLED") {
        if (requestId) sendToFrontend(ws, "request_cancelled", { requestId });
        memory.pop();
        state.setMemory(memory);
        break;
      }
      
      sendToFrontend(ws, "noa", { content: "I'm having trouble reaching my thoughts right now, Sensei. Shall I try again?", requestId });
      memory.pop();
      state.setMemory(memory);
      break;
    }
  }
}
