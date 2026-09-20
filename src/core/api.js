import OpenAI from 'openai';
import pc from 'picocolors';
import dotenv from 'dotenv';
dotenv.config();

const modelCooldowns = new Map();
const LLM_API_TIMEOUT_MS = 60000;
const openaiClients = new Map();

export function getOpenAI(proxyUrl, apiKey) {
  let cleanProxyUrl = proxyUrl.replace(/\/chat\/completions\/?$/, '');
  if (!cleanProxyUrl.endsWith('/')) {
    cleanProxyUrl += '/';
  }
  
  const cacheKey = `${cleanProxyUrl}-${apiKey}`;
  
  if (!openaiClients.has(cacheKey)) {
    if (!apiKey) {
      throw new Error("API Key is missing for this proxy.");
    }
    const client = new OpenAI({
      baseURL: cleanProxyUrl,
      apiKey: apiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/noa-chan",
        "X-Title": "Noa-chan",
      }
    });
    openaiClients.set(cacheKey, client);
  }
  return openaiClients.get(cacheKey);
}


export async function callAPIWithFallback(messages, toolsObj, proxyConfig, options = {}) {
  const model = proxyConfig?.model;
  
  if (!model || !proxyConfig.proxyUrl || !proxyConfig.apiKey) {
    throw new Error("Invalid proxy configuration provided.");
  }

  let payloadMessages = [...messages];
  if (proxyConfig.customPrompt && proxyConfig.customPrompt.trim().length > 0) {
     const customPromptMsg = { role: 'system', content: proxyConfig.customPrompt };
     payloadMessages.splice(1, 0, customPromptMsg); 
  }

  let isTimeout = false;
  let fallbackIsTimeout = false;
  
  if (modelCooldowns.has(model)) {
      modelCooldowns.delete(model);
  }

  try {
    const client = getOpenAI(proxyConfig.proxyUrl, proxyConfig.apiKey);
    const sanitizedPayloadMessages = payloadMessages.map(msg => {
      const copy = { ...msg };
      delete copy.reasoning_content;
      delete copy.reasoning_details;
      
      if (copy.content === null || copy.content === undefined) {
        copy.content = "";
      } else if (Array.isArray(copy.content)) {
        const textParts = copy.content
          .filter(part => part.type === 'text')
          .map(part => part.text);
        copy.content = textParts.join("\n") || "[Image omitted]";
      } else if (typeof copy.content === 'object' && copy.content !== null) {
        copy.content = JSON.stringify(copy.content);
      }
      
      const cleanMsg = { role: copy.role, content: copy.content };
      if (copy.tool_calls) cleanMsg.tool_calls = copy.tool_calls;
      if (copy.tool_call_id) cleanMsg.tool_call_id = copy.tool_call_id;
      if (typeof copy.name === 'string') cleanMsg.name = copy.name;
      
      return cleanMsg;
    });
    
    const payload = {
      model: model,
      messages: sanitizedPayloadMessages
    };
    
    if (toolsObj && Array.isArray(toolsObj) && toolsObj.length > 0) {
      const sanitizedTools = toolsObj.map(tool => {
        if (tool.type === 'function' && tool.function) {
          const { approval_required, ...rest } = tool.function;
          return { type: 'function', function: rest };
        }
        return tool;
      });
      payload.tools = sanitizedTools;
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
              console.log(pc.red(`\n[System] Model ${model} timed out after ${LLM_API_TIMEOUT_MS}ms.`));
              modelCooldowns.set(model, Date.now());
              throw err;
          }
          if (options.abortSignal?.aborted) {
              throw new Error("USER_CANCELLED");
          }
          console.log(pc.yellow(`\n[System] Model ${model} was aborted. Applying cooldown...`));
          modelCooldowns.set(model, Date.now());
          throw err;
      }

      if (err.status === 400 && !err?.error?.message?.toLowerCase().includes('token')) {
        console.log(pc.yellow(`\n[System] Model ${model} returned 400 (likely tools unsupported). Retrying without tools...`));
        console.error(pc.red(`[Debug] Initial 400 Error Details:`), JSON.stringify(err.error || err.message, null, 2));
        try {
          const client = getOpenAI(proxyConfig.proxyUrl, proxyConfig.apiKey);
          const sanitizedMessages = payloadMessages.filter(msg => msg.role !== 'tool').map(msg => {
            const copy = { ...msg };
            delete copy.reasoning_content;
            delete copy.reasoning_details;
            if (copy.role === 'assistant' && copy.tool_calls) {
              delete copy.tool_calls;
            }
            
            if (copy.content === null || copy.content === undefined) {
              copy.content = "";
            } else if (Array.isArray(copy.content)) {
              const textParts = copy.content
                .filter(part => part.type === 'text')
                .map(part => part.text);
              copy.content = textParts.join("\n") || "[Image omitted]";
            } else if (typeof copy.content === 'object' && copy.content !== null) {
              copy.content = JSON.stringify(copy.content);
            }
            
            const cleanMsg = { role: copy.role, content: copy.content };
            if (typeof copy.name === 'string') cleanMsg.name = copy.name;
            
            return cleanMsg;
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
                  console.log(pc.red(`\n[System] Fallback model ${model} timed out after ${LLM_API_TIMEOUT_MS}ms.`));
                  modelCooldowns.set(model, Date.now());
                  throw retryErr;
              }
              if (options.abortSignal?.aborted) throw new Error("USER_CANCELLED");
              modelCooldowns.set(model, Date.now());
              throw retryErr;
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
        console.log(pc.yellow(`\n[System] Model ${model} experienced a network/server issue (${err.status || err.message}). Reason: ${detailedReason}\nApplying cooldown...`));
        modelCooldowns.set(model, Date.now());
        throw err;
      }

      console.log(pc.yellow(`\n[System] Proxy ${model} failed (${err.status || err.message}). Reason: ${detailedReason}`));
    }
  throw new Error('API_CALL_FAILED');
}
