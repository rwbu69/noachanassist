<script>
    import { messages, ws, isRpsMode, addMessage } from '../../store.js';
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
                    $ws.send(JSON.stringify({ type: 'input', content: text }));
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
            placeholder="Enter command..." 
            autocomplete="off" 
            autofocus 
            rows="1">
        </textarea>
    </div>
</div>

<style>
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
