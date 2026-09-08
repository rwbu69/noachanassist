import fs from 'fs';
import path from 'path';
import os from 'os';
import pc from 'picocolors';
import { getOpenAI } from '../core/api.js';
import { getDataDir } from '../system/config.js';

import capabilitiesData from '../../data/capabilities.json' with { type: "json" };
import personaData from '../../data/persona.json' with { type: "json" };

const noaDir = getDataDir();
if (!fs.existsSync(noaDir)) {
  fs.mkdirSync(noaDir, { recursive: true });
}

const MEMORY_FILE = path.join(noaDir, 'memory.json');
const LONG_TERM_MEMORY_FILE = path.join(noaDir, 'long_term_memory.txt');
const SETTINGS_FILE = path.join(noaDir, 'settings.json');

export async function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) return JSON.parse(await fs.promises.readFile(MEMORY_FILE, 'utf8'));
  } catch (error) {}
  return [];
}

export async function saveMemory(memory) {
  try { await fs.promises.writeFile(MEMORY_FILE, JSON.stringify(memory, null, 2), 'utf8'); } catch (error) {}
}

export async function loadSettings() {
  let settings = { 
    userName: 'Sensei', 
    city: '', 
    exp: 0, 
    level: 1,
    models: [
      'nvidia/nemotron-3-ultra-550b-a55b:free',
      'nvidia/nemotron-3.5-lightning:free',
      'nvidia/nemotron-3-super-120b-a12b:free',
      'thinkingmachines/inkling:free',
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'
    ],
    maxContextTokens: 8000
  };
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
        const loaded = JSON.parse(await fs.promises.readFile(SETTINGS_FILE, 'utf8'));
        if (loaded.models) {
          if (Array.isArray(loaded.models)) {
            loaded.models = loaded.models
              .filter((model) => typeof model === 'string')
              .map((model) => model.trim())
              .filter(Boolean);
          }
          if (!Array.isArray(loaded.models) || loaded.models.length === 0) {
            delete loaded.models; // Fallback to defaults if invalid
          }
        }
        settings = { ...settings, ...loaded };
    }
  } catch (error) {}
  return settings;
}

export async function saveSettings(settings) {
  try { await fs.promises.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8'); } catch (error) {}
}

export function loadCapabilities() {
  return capabilitiesData || [];
}

export async function loadLongTermMemory() {
  try {
    if (fs.existsSync(LONG_TERM_MEMORY_FILE)) return await fs.promises.readFile(LONG_TERM_MEMORY_FILE, 'utf8');
  } catch (error) {}
  return '';
}

export function formatMemoryForSummarizer(memory) {
  return memory
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role === 'assistant' ? 'Noa' : 'Sensei'}: ${m.content}`)
    .join('\n');
}

export async function summarizeAndArchive(memory) {
  const userAssistantMsgs = memory.filter(m => m.role === 'user' || m.role === 'assistant');
  if (userAssistantMsgs.length < 15) return memory;
  
  console.log(pc.yellow('\n[ System ] Context limit approaching. Summarizing old memories...'));
  
  const memoryToSummarize = memory.slice(0, memory.length - 10);
  const recentMemory = memory.slice(memory.length - 10);
  
  const formattedLog = formatMemoryForSummarizer(memoryToSummarize);
  
  const summaryPrompt = [
      { role: 'system', content: 'You are a highly efficient memory summarization system. Summarize the following conversation log into a concise, detailed paragraph capturing all facts, user preferences, and context.' },
      { role: 'user', content: formattedLog }
  ];

  const settings = await loadSettings();
  const fallbackModel = (settings.models && settings.models.length > 0) ? settings.models[0] : 'openrouter/free';

  try {
      const client = getOpenAI();
      const response = await client.chat.completions.create({
          model: fallbackModel,
          messages: summaryPrompt
      });
      const facts = response.choices[0].message.content;
      await fs.promises.appendFile(LONG_TERM_MEMORY_FILE, `\n${facts}`, 'utf8');
      console.log(pc.greenBright('[System] Long-Term Memory successfully updated!'));
      await saveMemory(recentMemory);
      return recentMemory;
  } catch (e) {
    console.log(pc.redBright(`[System] Failed to archive memory: ${e.message}`));
    return memory; 
  }
}

export async function loadPersona(capabilities, userSettings = {}) {
  try {
    const data = personaData;
    const userName = userSettings.userName || 'Sensei';
    
    let prompt = `ROLE: ${data.identity?.role || 'Companion'}\nName: ${data.identity?.name || 'Ushio Noa'}\nAge Presentation: ${data.identity?.age_presentation || 'adult'}\n`;
    prompt += `You must refer to the user as ${userName}.\n\n`;
    
    if (data.backstory) {
      prompt += `BACKSTORY:\n${data.backstory.summary}\n`;
      if (Array.isArray(data.backstory.details)) {
        for (const detail of data.backstory.details) prompt += `- ${detail}\n`;
      }
      prompt += '\n';
    }

    if (data.appearance) {
      prompt += `APPEARANCE:\n${data.appearance.summary}\nRule: ${data.appearance.usage_rule}\n\n`;
    }

    if (data.voice) {
      prompt += `VOICE & TONE:\nTone: ${(data.voice.tone || []).join(', ')}\nStyle: ${data.voice.style}\nHumor: ${data.voice.humor}\nAvoid: ${(data.voice.avoid || []).join(', ')}\n\n`;
    }

    if (data.relationships) {
      prompt += `RELATIONSHIPS:\n`;
      for (const [person, desc] of Object.entries(data.relationships)) prompt += `- ${person}: ${desc}\n`;
      prompt += '\n';
    }

    if (data.emotional_reactions) {
      prompt += `EMOTIONAL REACTIONS:\n`;
      for (const [reaction, desc] of Object.entries(data.emotional_reactions)) prompt += `- ${reaction}: ${desc}\n`;
      prompt += '\n';
    }

    if (data.preferences) {
      prompt += `PREFERENCES:\nLikes: ${(data.preferences.likes || []).join(', ')}\nDislikes: ${(data.preferences.dislikes || []).join(', ')}\n\n`;
    }

    if (data.core_beliefs && Array.isArray(data.core_beliefs)) {
      prompt += `CORE BELIEFS:\n`;
      for (const belief of data.core_beliefs) prompt += `- ${belief}\n`;
      prompt += '\n';
    }

    if (data.conversation_control) {
      prompt += `CONVERSATION CONTROL:\nAdaptation:\n`;
      if (Array.isArray(data.conversation_control.adaptation)) {
        for (const rule of data.conversation_control.adaptation) prompt += `- ${rule}\n`;
      }
      if (data.conversation_control.response_length) {
         prompt += `Response Lengths:\n`;
         for (const [type, desc] of Object.entries(data.conversation_control.response_length)) prompt += `- ${type}: ${desc}\n`;
      }
      prompt += '\n';
    }

    if (data.relationship_boundaries) {
      prompt += `RELATIONSHIP BOUNDARIES:\n`;
      for (const [bound, desc] of Object.entries(data.relationship_boundaries)) prompt += `- ${bound}: ${desc}\n`;
      prompt += '\n';
    }

    if (data.memory_policy) {
      prompt += `MEMORY POLICY:\nRule: ${data.memory_policy.rule}\nConsent: ${data.memory_policy.consent}\nArchive Format: ${(data.memory_policy.archive_format || []).join(', ')}\n\n`;
    }

    if (data.mode_switching) {
      prompt += `MODE SWITCHING:\n`;
      for (const [mode, desc] of Object.entries(data.mode_switching)) prompt += `- ${mode}: ${desc}\n`;
      prompt += '\n';
    }

    if (data.tool_reactions) {
      prompt += `TOOL REACTIONS:\n`;
      for (const [tool, desc] of Object.entries(data.tool_reactions)) prompt += `- ${tool}: ${desc}\n`;
      prompt += '\n';
    }

    if (data.fun_interactions) {
      prompt += `FUN INTERACTIONS:\n`;
      for (const [interaction, details] of Object.entries(data.fun_interactions)) {
        prompt += `- ${interaction}: ${details.description}\n`;
        if (details.rule) prompt += `  Rule: ${details.rule}\n`;
        if (details.format) prompt += `  Format: ${details.format.join(', ')}\n`;
      }
      prompt += '\n';
    }

    if (data.example_dialogues && Array.isArray(data.example_dialogues)) {
      prompt += `EXAMPLE DIALOGUES:\n`;
      for (const dialogue of data.example_dialogues) prompt += `- ${dialogue}\n`;
      prompt += '\n';
    }

    if (capabilities && capabilities.length > 0) {
      prompt += `YOUR CAPABILITIES (TOOLS):\nYou have access to the following tools to assist Sensei. Use them proactively!\n`;
      for (const tool of capabilities) prompt += `- ${tool.function.name}: ${tool.function.description}\n`;
      prompt += '\n';
    }

    const ltm = await loadLongTermMemory();
    if (ltm) prompt += `LONG-TERM MEMORY (Facts you have learned about ${userName}):\n${ltm}\n`;

    return prompt;
  } catch (error) {
    console.error(pc.red(`Could not parse persona definition: ${error.message}`));
    return `ROLE: Ushio Noa. You must refer to the user as ${userSettings.userName || 'Sensei'}. (Fallback persona active due to parsing error)`;
  }
}

export function getCircadianMood() {
  const hour = new Date().getHours();
  if (hour >= 23 || hour <= 4) return "[MOOD OVERRIDE: It is very late. You are feeling sleepy, soft, and slightly clingy towards Sensei.]";
  if (hour >= 9 && hour <= 17) return "[MOOD OVERRIDE: It is working hours. You are feeling professional, attentive, and highly focused on assisting Sensei.]";
  return "[MOOD OVERRIDE: It is evening. You are feeling relaxed, playful, and casually teasing.]";
}
