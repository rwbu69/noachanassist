import OpenAI from 'openai';
import pc from 'picocolors';
import dotenv from 'dotenv';
dotenv.config();

const modelCooldowns = new Map();
const LLM_API_TIMEOUT_MS = 60000;
let _openai = null;

export function getOpenAI() {
  if (!_openai) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not set.");
    }
    _openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/noa-chan",
        "X-Title": "Noa-chan",
      }
    });
  }
  return _openai;
}

export async function callAPIWithFallback(messages, toolsObj, models, options = {}) {
  const eligibleModels = Array.isArray(models)
    ? models.map((model) => typeof model === "string" ? model.trim() : "").filter(Boolean)
    : [];

  if (eligibleModels.length === 0) {
    throw new Error("No models configured for API call.");
  }

  let availableModels = eligibleModels.filter(m => !modelCooldowns.has(m) || (Date.now() - modelCooldowns.get(m) >= 5 * 60 * 1000));
  
  if (availableModels.length === 0) {
      console.log(pc.yellow("\n[System] All configured models are currently on cooldown. Bypassing cooldowns for this request."));
      availableModels = eligibleModels;
  }

  for (let i = 0; i < availableModels.length; i++) {

    const model = availableModels[i];
    let isTimeout = false;
    let fallbackIsTimeout = false;
    
    if (modelCooldowns.has(model)) {
        modelCooldowns.delete(model);
    }

    try {
      const client = getOpenAI();
      const sanitizedPayloadMessages = messages.map(msg => {
        const copy = { ...msg };
        delete copy.reasoning_content;
        delete copy.reasoning_details;
        return copy;
      });
      
      const payload = {
        model: model,
        messages: sanitizedPayloadMessages
      };
      
      if (toolsObj && Array.isArray(toolsObj) && toolsObj.length > 0) {
        payload.tools = toolsObj;
        payload.tool_choice = "auto";
      }

      const controller = new AbortController();

      let abortListener = null;
      if (options.abortSignal) {
          abortListener = () => controller.abort();
          options.abortSignal.addEventListener('abort', abortListener);
      }

      const timeoutId = setTimeout(() => {
          isTimeout = true;
          controller.abort();
      }, LLM_API_TIMEOUT_MS);

      let completion;
      try {
        completion = await client.chat.completions.create(payload, { signal: controller.signal });
      } catch (err) {
        if (abortListener && options.abortSignal) options.abortSignal.removeEventListener('abort', abortListener);
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
      
      if (abortListener && options.abortSignal) options.abortSignal.removeEventListener('abort', abortListener);
      
      if (completion && (!completion.choices || completion.choices.length === 0)) {
          const errMsg = completion.error?.message || completion.error || "Invalid response from provider (no choices returned)";
          throw new Error(`PROVIDER_ERROR: ${errMsg}`);
      }

      modelCooldowns.delete(model);

      return completion;

    } catch (err) {
      if (err.name === 'AbortError' || err.message === 'ABORTED' || err.message?.includes('Request was aborted') || err.name === 'APIUserAbortError') {
          if (isTimeout) {
              console.log(pc.red(`\n[System] Model ${model} timed out after ${LLM_API_TIMEOUT_MS}ms. Routing to fallback...`));
              modelCooldowns.set(model, Date.now());
              continue;
          }
          if (options.abortSignal?.aborted) {
              throw new Error("USER_CANCELLED");
          }
          console.log(pc.yellow(`\n[System] Model ${model} was aborted. Applying cooldown...`));
          modelCooldowns.set(model, Date.now());
          continue;
      }

      if (err.status === 400 && !err?.error?.message?.toLowerCase().includes('token')) {
        console.log(pc.yellow(`\n[System] Model ${model} returned 400 (likely tools unsupported). Retrying without tools...`));
        try {
          const client = getOpenAI();
          const sanitizedMessages = messages.filter(msg => msg.role !== 'tool').map(msg => {
            const copy = { ...msg };
            delete copy.reasoning_content;
            delete copy.reasoning_details;
            if (copy.role === 'assistant' && copy.tool_calls) {
              delete copy.tool_calls;
            }
            return copy;
          });

          const controller = new AbortController();
          
          let abortListener = null;
          if (options.abortSignal) {
              abortListener = () => controller.abort();
              options.abortSignal.addEventListener('abort', abortListener);
          }

          const fallbackTimeoutId = setTimeout(() => {
              fallbackIsTimeout = true;
              controller.abort();
          }, LLM_API_TIMEOUT_MS);

          let completion;
          try {
            completion = await client.chat.completions.create({
              model: model,
              messages: sanitizedMessages
            }, { signal: controller.signal });
          } catch (retryErr) {
            if (abortListener && options.abortSignal) options.abortSignal.removeEventListener('abort', abortListener);
            throw retryErr;
          } finally {
            clearTimeout(fallbackTimeoutId);
          }

          if (abortListener && options.abortSignal) options.abortSignal.removeEventListener('abort', abortListener);

          if (completion && (!completion.choices || completion.choices.length === 0)) {
              const errMsg = completion.error?.message || completion.error || "Invalid response from provider (no choices returned)";
              throw new Error(`PROVIDER_ERROR: ${errMsg}`);
          }

          modelCooldowns.delete(model);
          return completion;

        } catch (retryErr) {
          if (retryErr.name === 'AbortError' || retryErr.message === 'ABORTED' || retryErr.message?.includes('Request was aborted') || retryErr.name === 'APIUserAbortError') {
              if (fallbackIsTimeout) {
                  console.log(pc.red(`\n[System] Fallback model ${model} timed out after ${LLM_API_TIMEOUT_MS}ms. Routing to fallback...`));
                  modelCooldowns.set(model, Date.now());
                  continue;
              }
              if (options.abortSignal?.aborted) throw new Error("USER_CANCELLED");
              modelCooldowns.set(model, Date.now());
              continue;
          }
          console.error(pc.red(`[Debug] Fallback 400 Error Details:`), JSON.stringify(retryErr.error || retryErr.message, null, 2));
          err = retryErr;
        }
      }

      if (err.status === 413 || (err.status === 400 && err?.error?.message?.toLowerCase().includes('token'))) {
        throw new Error('CONTEXT_LIMIT');
      }

      const isNetworkOrServerErr = err.status >= 500 || err.status === 429 || err.status === 408 || err.message?.includes('ENOTFOUND') || err.message?.includes('fetch') || err.name === 'APITimeoutError' || err.message?.includes('PROVIDER_ERROR');
      const detailedReason = err?.error?.message || err?.error || err.message || JSON.stringify(err);

      if (isNetworkOrServerErr) {
        console.log(pc.yellow(`\n[System] Model ${model} experienced a network/server issue (${err.status || err.message}). Reason: ${detailedReason}\nSkipping and applying cooldown...`));
        modelCooldowns.set(model, Date.now());
        continue;
      }

      console.log(pc.yellow(`\n[System] Model ${model} failed (${err.status || err.message}). Reason: ${detailedReason}\nRouting to fallback...`));
    }
  }
  
  throw new Error('ALL_FALLBACKS_FAILED');
}
