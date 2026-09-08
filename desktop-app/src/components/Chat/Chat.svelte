<script>
    import { messages, ws, isRpsMode, addMessage, isGenerating, activeRequestId } from '../../store.js';
    import { marked } from 'marked';
    import hljs from 'highlight.js';
    import { afterUpdate } from 'svelte';

    marked.setOptions({
        highlight: function(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-',
        breaks: true
    });

    let chatInput = '';
    let chatLogElement;
    let inputElement;

    function parseMarkdown(text) {
        return marked.parse(text);
    }

    function handleKeydown(e) {
        if (e.key === 'Enter') {
            if (e.shiftKey) return;
            e.preventDefault();
            const text = chatInput.trim();
            if (text) {
                addMessage('user', text);
            if ($ws && $ws.readyState === WebSocket.OPEN) {
                const requestId = Date.now().toString() + Math.random().toString(36).substring(7);
                activeRequestId.set(requestId);
                isGenerating.set(true);
                $ws.send(JSON.stringify({ type: 'input', content: text, requestId }));
            }
            chatInput = '';
                inputElement.style.height = '20px';
            }
        }
    }

    function handleInput() {
        if (inputElement) {
            inputElement.style.height = '20px';
            inputElement.style.height = Math.min(inputElement.scrollHeight, 150) + 'px';
        }
    }

    function selectRps(choice) {
        if ($ws && $ws.readyState === WebSocket.OPEN) {
            $ws.send(JSON.stringify({ type: 'rps_choice', choice }));
            isRpsMode.set(false);
        }
    }

    let localStatus = '';
    let statusTimer = null;
    $: if ($isGenerating) {
        if (!statusTimer) {
            localStatus = 'Noa is thinking...';
            statusTimer = setTimeout(() => {
                if ($isGenerating) {
                    localStatus = "I'm still here, Sensei. I'm considering this carefully...";
                }
            }, 5000);
        }
    } else {
        clearTimeout(statusTimer);
        statusTimer = null;
        localStatus = '';
    }

    let isStopping = false;
    let stoppingTimeout = null;

    function handleStop() {
        if (isStopping) return;
        if ($ws && $ws.readyState === WebSocket.OPEN && $activeRequestId) {
            isStopping = true;
            $ws.send(JSON.stringify({ type: 'cancel_request', requestId: $activeRequestId }));
            
            stoppingTimeout = setTimeout(() => {
                if ($isGenerating) {
                    isGenerating.set(false);
                    activeRequestId.set(null);
                    isStopping = false;
                }
            }, 3000);
        }
    }

    $: if (!$isGenerating) {
        isStopping = false;
        if (stoppingTimeout) {
            clearTimeout(stoppingTimeout);
            stoppingTimeout = null;
        }
    }

    // Auto-scroll to bottom when messages update
    afterUpdate(() => {
        if (chatLogElement) {
            chatLogElement.scrollTop = chatLogElement.scrollHeight;
        }
    });
</script>

<div id="chat-container">
    <div id="chat-log" bind:this={chatLogElement}>
        {#each $messages as group}
            {#if group.role === 'system' || group.role === 'tool'}
                <div class="message-group {group.role}">
                    {#each group.texts as text}
                        <div class="bubble">{@html parseMarkdown(text)}</div>
                    {/each}
                </div>
            {:else}
                <div class="message-group {group.role}">
                    <div class="avatar"></div>
                    <div class="bubbles-container">
                        <div class="sender-name">{group.role === 'noa' ? 'Noa' : 'Sensei'}</div>
                        {#each group.texts as text}
                            <div class="bubble">{@html parseMarkdown(text)}</div>
                        {/each}
                    </div>
                </div>
            {/if}
        {/each}
        
        {#if $isGenerating}
            <div class="message-group noa">
                <div class="avatar"></div>
                <div class="bubbles-container">
                    <div class="sender-name">Noa</div>
                    <div class="status-indicator"><i>{localStatus}</i></div>
                </div>
            </div>
        {/if}
    </div>
    
    {#if $isRpsMode}
        <div class="rps-container">
            <div class="rps-title">Rock Paper Scissors! Select your move:</div>
            <div class="rps-buttons">
                <button class="rps-btn" on:click={() => selectRps('rock')}>🪨 Rock</button>
                <button class="rps-btn" on:click={() => selectRps('paper')}>📄 Paper</button>
                <button class="rps-btn" on:click={() => selectRps('scissors')}>✂️ Scissors</button>
            </div>
        </div>
    {/if}

    <div id="input-container">
        <span class="prompt-prefix">[ Sensei ] ❯</span>
        <!-- svelte-ignore a11y-autofocus -->
        <textarea 
            id="chat-input" 
            bind:this={inputElement}
            bind:value={chatInput}
            on:keydown={handleKeydown}
            on:input={handleInput}
            placeholder={$isGenerating ? "Wait for Noa to finish..." : "Enter command..."} 
            autocomplete="off" 
            disabled={$isGenerating}
            autofocus 
            rows="1">
        </textarea>
        {#if $isGenerating}
            <button type="button" class="stop-btn" on:click={handleStop}>
                {isStopping ? 'Stopping...' : 'Stop ⏹'}
            </button>
        {/if}
    </div>
</div>

<style>
    .status-indicator {
        font-size: 13px;
        color: var(--dim-color);
        margin-top: 5px;
        margin-left: 5px;
        animation: pulse 1.5s infinite;
    }

    .stop-btn {
        margin-left: 10px;
        padding: 6px 12px;
        background: rgba(255, 85, 85, 0.1);
        border: 1px solid rgba(255, 85, 85, 0.3);
        color: #ff5555;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        transition: all 0.2s ease;
        white-space: nowrap;
    }
    
    .stop-btn:hover {
        background: rgba(255, 85, 85, 0.2);
        transform: translateY(-1px);
    }
    .rps-container {
        padding: 15px 20px;
        background: var(--bg-color);
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
    
    .rps-title {
        color: var(--system-color);
        font-weight: bold;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 1px;
    }
    
    .rps-buttons {
        display: flex;
        gap: 10px;
    }
    
    .rps-btn {
        flex: 1;
        padding: 10px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        color: var(--text-color);
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s ease;
    }
    
    .rps-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: var(--system-color);
        transform: translateY(-2px);
    }
</style>
