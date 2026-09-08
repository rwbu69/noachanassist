<script>
    import { settings, ws } from '../../store.js';
    import { enable, disable } from '@tauri-apps/plugin-autostart';

    export let isOpen = false;
    export let onClose;

    let activeTab = 'general';
    let tempSettings = { ...$settings };
    let modelsText = "";

    let prevIsOpen = false;
    $: {
        if (isOpen && !prevIsOpen) {
            tempSettings = JSON.parse(JSON.stringify($settings));
            modelsText = (tempSettings.models || []).join('\n');
            activeTab = 'general';
        }
        prevIsOpen = isOpen;
    }

    async function handleSave() {
        if (tempSettings.autostart) {
            try { await enable(); } catch(e) {}
        } else {
            try { await disable(); } catch(e) {}
        }

        localStorage.setItem('noa_apiKey', tempSettings.apiKey);
        localStorage.setItem('noa_userName', tempSettings.userName);
        localStorage.setItem('noa_city', tempSettings.city);
        localStorage.setItem('noa_theme', tempSettings.theme);
        localStorage.setItem('noa_storageDir', tempSettings.storageDir);
        localStorage.setItem('noa_autostart', tempSettings.autostart);
        localStorage.setItem('noa_hideTray', tempSettings.hideTray);
        localStorage.setItem('noa_proactive', tempSettings.proactiveMode);
        localStorage.setItem('noa_proactiveInterval', tempSettings.proactiveInterval);
        localStorage.setItem('noa_notificationSound', tempSettings.notificationSound);

        tempSettings.models = modelsText.split('\n').map(s => s.trim()).filter(Boolean);

        settings.set(tempSettings);

        if (tempSettings.theme === 'dark') {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }

        if ($ws && $ws.readyState === WebSocket.OPEN) {
            $ws.send(JSON.stringify({ type: 'settings', ...tempSettings }));
        }
        
        onClose();
    }
</script>

{#if isOpen}
    <div class="overlay" style="display: flex;">
        <div class="overlay-content settings-modal-content">
            <div class="settings-header">
                <h2>[ CONFIGURATION ]</h2>
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <span class="close-btn" on:click={onClose}>[X]</span>
            </div>
            
            <div class="settings-layout">
                <div class="settings-sidebar">
                    <button class="tab-button" class:active={activeTab === 'general'} on:click={() => activeTab = 'general'}>General</button>
                    <button class="tab-button" class:active={activeTab === 'ai'} on:click={() => activeTab = 'ai'}>AI & Models</button>
                    <button class="tab-button" class:active={activeTab === 'system'} on:click={() => activeTab = 'system'}>System</button>
                </div>
                
                <div class="settings-main">
                    {#if activeTab === 'general'}
                        <div class="settings-group">
                            <label for="username">User Name:</label>
                            <input id="username" type="text" bind:value={tempSettings.userName} placeholder="e.g., Sensei, John">
                        </div>
                        <div class="settings-group">
                            <label for="city">City (for Weather):</label>
                            <input id="city" type="text" bind:value={tempSettings.city} placeholder="e.g., Tokyo, London">
                        </div>
                        <div class="settings-group">
                            <label for="theme">Theme:</label>
                            <select id="theme" bind:value={tempSettings.theme}>
                                <option value="light">Light</option>
                                <option value="dark">Dark</option>
                            </select>
                        </div>
                    {:else if activeTab === 'ai'}
                        <div class="settings-group">
                            <label for="apikey">API Key:</label>
                            <input id="apikey" type="password" bind:value={tempSettings.apiKey} placeholder="Enter API Key">
                        </div>
                        <div class="settings-group">
                            <label for="models">Fallback Models (one per line):</label>
                            <textarea id="models" bind:value={modelsText} placeholder="e.g. openrouter/free" rows="4" style="width: 100%; resize: vertical; padding: 6px; border-radius: 4px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-color); font-family: 'DM Mono', monospace; font-size: 11px;"></textarea>
                        </div>
                        <div class="settings-group checkbox">
                            <label><input type="checkbox" bind:checked={tempSettings.proactiveMode}> Enable Proactive Mode</label>
                        </div>
                        {#if tempSettings.proactiveMode}
                        <div class="settings-group">
                            <label for="proactive-slider">Proactive Interval: {tempSettings.proactiveInterval || 5} minutes</label>
                            <input id="proactive-slider" type="range" min="5" max="30" bind:value={tempSettings.proactiveInterval}>
                        </div>
                        {/if}
                    {:else if activeTab === 'system'}
                        <div class="settings-group">
                            <label for="storagedir">Storage Directory (Optional):</label>
                            <input id="storagedir" type="text" bind:value={tempSettings.storageDir} placeholder="e.g. D:\NoaData">
                        </div>
                        <div class="settings-group checkbox">
                            <label><input type="checkbox" bind:checked={tempSettings.notificationSound}> Enable Notification Sound</label>
                        </div>
                        <div class="settings-group checkbox">
                            <label><input type="checkbox" bind:checked={tempSettings.autostart}> Run on Startup</label>
                        </div>
                        <div class="settings-group checkbox">
                            <label><input type="checkbox" bind:checked={tempSettings.hideTray}> Hide to Tray on Boot</label>
                        </div>
                    {/if}
                </div>
            </div>
            
            <button id="save-settings" on:click={handleSave}>[ SAVE ]</button>
        </div>
    </div>
{/if}
