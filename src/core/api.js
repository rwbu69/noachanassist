import OpenAI from 'openai';
import pc from 'picocolors';
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
let _openai = null;

export function getOpenAI() {
  if (!_openai) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not set.");
    }
    _openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      timeout: 30000,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/noa-chan",
        "X-Title": "Noa-chan",
      }
    });
  }
  return _openai;
}

export async function callAPIWithFallback(messages, toolsObj, models = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'poolside/laguna-s-2.1:free',
  'nvidia/nemotron-3.5-lightning:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'thinkingmachines/inkling:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'
]) {
  if (!models || models.length === 0) {
    throw new Error("No models configured for API call.");
  }

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const client = getOpenAI();
      const payload = {
        model: model,
        messages: messages
      };
      
      if (toolsObj && Array.isArray(toolsObj) && toolsObj.length > 0) {
        payload.tools = toolsObj;
        payload.tool_choice = "auto";
      }

      const response = await client.chat.completions.create(payload);
      
      if (!response || !response.choices || response.choices.length === 0) {
        throw new Error(`Malformed response from model (no choices): ${JSON.stringify(response)}`);
      }
      
      return response;
    } catch (err) {
      if (err.status === 400 && !err?.error?.message?.toLowerCase().includes('token')) {
        console.log(pc.yellow(`\n[System] Model ${model} returned 400 (likely tools unsupported). Retrying without tools...`));
        try {
          const client = getOpenAI();
          // Debug payload
          fs.writeFileSync('scratch_payload.json', JSON.stringify(messages, null, 2));
          
          // Sanitize messages to remove any tool interaction history
          const sanitizedMessages = messages.filter(msg => msg.role !== 'tool').map(msg => {
            if (msg.role === 'assistant' && msg.tool_calls) {
              const { tool_calls, ...rest } = msg;
              return rest;
            }
            return msg;
          });

          const fallbackResponse = await client.chat.completions.create({
            model: model,
            messages: sanitizedMessages,
          });
          
          if (!fallbackResponse || !fallbackResponse.choices || fallbackResponse.choices.length === 0) {
            throw new Error(`Malformed fallback response from model (no choices): ${JSON.stringify(fallbackResponse)}`);
          }
          
          return fallbackResponse;
        } catch (retryErr) {
          console.error(pc.red(`[Debug] Fallback 400 Error Details:`), JSON.stringify(retryErr.error, null, 2));
          err = retryErr;
        }
      }

      if (err.status === 413 || (err.status === 400 && err?.error?.message?.toLowerCase().includes('token'))) {
        throw new Error('CONTEXT_LIMIT');
      }

      const isNetworkOrServerErr = err.status >= 500 || err.status === 429 || err.status === 408 || err.message.includes('ENOTFOUND') || err.message.includes('fetch') || err.name === 'APITimeoutError';
      const detailedReason = err?.error?.message || err?.error || err.message || JSON.stringify(err);

      if (isNetworkOrServerErr) {
        console.log(pc.yellow(`\n[System] Model ${model} experienced a network/server issue (${err.status || err.message}). Reason: ${detailedReason}\nRouting to fallback...`));
        if (i === models.length - 1) {
          throw new Error('NETWORK_DISCONNECT');
        }
        continue;
      }

      console.log(pc.yellow(`\n[System] Model ${model} failed (${err.status || err.message}). Reason: ${detailedReason}\nRouting to fallback...`));
      if (i === models.length - 1) {
        throw new Error(`All fallback models failed. Last error: ${err.message}`);
      }
    }
  }
}
