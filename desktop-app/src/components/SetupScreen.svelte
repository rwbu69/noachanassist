<script>
    import { createEventDispatcher } from 'svelte';
    import { settings, ws } from '../store.js';

    const dispatch = createEventDispatcher();

    let apiKey = '';
    let connectionError = '';

    function completeCloud() {
        if (!apiKey.trim()) {
            connectionError = 'API key is required for cloud models.';
            return;
        }
        settings.update(s => ({ ...s, apiKey: apiKey.trim() }));
        localStorage.setItem('noa_apiKey', apiKey.trim());
        syncSettings();
        dispatch('complete');
    }

    function syncSettings() {
        let currentSettings;
        settings.subscribe(s => currentSettings = s)();
        if ($ws && $ws.readyState === 1) {
            $ws.send(JSON.stringify({ type: 'settings', ...currentSettings }));
        }
    }
</script>

<div class="setup-container">
    <div class="setup-modal">
        <img src="/assets/noa.png" alt="Noa Icon" class="setup-icon">
        <h2>Welcome to Noa-chan Assist</h2>
        <p class="subtitle">Please configure your AI inference backend.</p>

        <div class="setup-step">
            <h3>Configure Cloud Model</h3>
            <div class="form-group">
                <label for="api-key">OpenRouter API Key</label>
                <input id="api-key" type="password" bind:value={apiKey} placeholder="sk-or-v1-...">
            </div>
            
            {#if connectionError}
                <div class="error-msg">{connectionError}</div>
            {/if}

            <div class="actions">
                <button class="btn primary" on:click={completeCloud}>Save & Continue</button>
            </div>
        </div>
    </div>
</div>

<style>
    .setup-container {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: var(--bg-color, #0a0a0a);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        color: var(--text-color, #e0e0e0);
        font-family: 'Inter', 'Segoe UI', sans-serif;
    }
    .setup-modal {
        background: var(--surface-color, #1a1a1a);
        padding: 40px;
        border-radius: 12px;
        border: 1px solid var(--border-color, #333);
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        max-width: 500px;
        width: 100%;
        text-align: center;
    }
    .setup-icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        margin-bottom: 20px;
    }
    h2 {
        margin: 0 0 10px 0;
        font-size: 24px;
        color: var(--accent-color, #a855f7);
    }
    .subtitle {
        color: var(--dim-color, #888);
        margin-bottom: 30px;
    }
    .options {
        display: flex;
        gap: 20px;
        justify-content: center;
    }
    .option-card {
        flex: 1;
        background: var(--input-bg, #222);
        border: 1px solid var(--border-color, #444);
        border-radius: 8px;
        padding: 20px;
        cursor: pointer;
        transition: all 0.2s;
    }
    .option-card:hover {
        border-color: var(--accent-color, #a855f7);
        transform: translateY(-2px);
    }
    .option-card .icon {
        font-size: 32px;
        margin-bottom: 10px;
    }
    .option-card h3 {
        font-size: 16px;
        margin-bottom: 8px;
    }
    .option-card p {
        font-size: 13px;
        color: var(--dim-color, #888);
        line-height: 1.4;
    }
    .setup-step {
        text-align: left;
    }
    .setup-step h3 {
        margin-top: 0;
        color: var(--accent-color, #a855f7);
    }
    .form-group {
        margin-bottom: 20px;
    }
    .form-group label {
        display: block;
        margin-bottom: 8px;
        font-size: 14px;
        color: var(--dim-color, #888);
    }
    .form-group input {
        width: 100%;
        padding: 10px;
        background: var(--input-bg, #222);
        border: 1px solid var(--input-border, #444);
        color: var(--text-color, #eee);
        border-radius: 6px;
        font-size: 14px;
        box-sizing: border-box;
    }
    .form-group input:focus {
        outline: none;
        border-color: var(--accent-color, #a855f7);
    }
    .actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
    }
    .btn {
        padding: 10px 20px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
        font-weight: 600;
        transition: opacity 0.2s;
    }
    .btn:hover:not(:disabled) {
        opacity: 0.9;
    }
    .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .btn.primary {
        background: var(--accent-color, #a855f7);
        color: #fff;
    }
    .btn.secondary {
        background: transparent;
        border: 1px solid var(--border-color, #555);
        color: var(--text-color, #eee);
    }
    .error-msg {
        color: #ef4444;
        font-size: 13px;
        margin-top: -10px;
        margin-bottom: 10px;
        padding: 10px;
        background: rgba(239, 68, 68, 0.1);
        border-radius: 6px;
    }
</style>
