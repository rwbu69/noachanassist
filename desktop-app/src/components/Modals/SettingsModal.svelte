<script>
    import { settings, ws } from '../../store.js';
    import { enable, disable } from '@tauri-apps/plugin-autostart';

    export let isOpen = false;
    export let onClose;

    let activeTab = 'general';
    let tempSettings = { ...$settings };
    let prevIsOpen = false;
    let showKeys = {};

    $: {
        if (isOpen && !prevIsOpen) {
            tempSettings = JSON.parse(JSON.stringify($settings));
            if (!tempSettings.proxies) tempSettings.proxies = [];
            activeTab = 'general';
            showKeys = {};
        }
        prevIsOpen = isOpen;
    }

    function addProxy() {
        tempSettings.proxies = [...tempSettings.proxies, {
            id: 'proxy-' + Date.now(),
            name: "New Proxy",
            proxyUrl: "",
            apiKey: "",
            model: "",
            customPrompt: "",
            isActive: tempSettings.proxies.length === 0
        }];
    }

    function deleteProxy(index) {
        const proxy = tempSettings.proxies[index];
        tempSettings.proxies = tempSettings.proxies.filter((_, i) => i !== index);
        if (proxy.isActive && tempSettings.proxies.length > 0) {
            tempSettings.proxies[0].isActive = true;
        }
    }

    function setProxyActive(index) {
        tempSettings.proxies.forEach((p, i) => {
            p.isActive = i === index;
        });
        tempSettings.proxies = [...tempSettings.proxies];
    }

    async function handleSave() {
        if (tempSettings.autostart) {
            try { await enable(); } catch(e) {}
        } else {
            try { await disable(); } catch(e) {}
        }

        const activeProxy = tempSettings.proxies?.find(p => p.isActive) || tempSettings.proxies?.[0];
        const keyToSave = activeProxy ? activeProxy.apiKey : '';
        localStorage.setItem('noa_apiKey', keyToSave);
        localStorage.setItem('noa_userName', tempSettings.userName);
        localStorage.setItem('noa_city', tempSettings.city);
        localStorage.setItem('noa_theme', tempSettings.theme);
        localStorage.setItem('noa_storageDir', tempSettings.storageDir);
        localStorage.setItem('noa_autostart', tempSettings.autostart);
        localStorage.setItem('noa_hideTray', tempSettings.hideTray);
        localStorage.setItem('noa_proactive', tempSettings.proactiveMode);
        localStorage.setItem('noa_proactiveInterval', tempSettings.proactiveInterval);
        localStorage.setItem('noa_notificationSound', tempSettings.notificationSound);
        localStorage.setItem('noa_elevenLabsApiKey', tempSettings.elevenLabsApiKey);
        localStorage.setItem('noa_elevenLabsVoiceId', tempSettings.elevenLabsVoiceId);
        localStorage.setItem('noa_enableVoice', tempSettings.enableVoice);



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
        <div class="modal-content">
            <div class="modal-header">
                <h2>[ CONFIGURATION ]</h2>
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <span class="close-btn" on:click={onClose}>[X]</span>
            </div>
            
            <div class="settings-layout">
                <div class="settings-sidebar">
                    <button class="tab-button" class:active={activeTab === 'general'} on:click={() => activeTab = 'general'}>General</button>
                    <button class="tab-button" class:active={activeTab === 'ai'} on:click={() => activeTab = 'ai'}>AI & Models</button>
                    <button class="tab-button" class:active={activeTab === 'voice'} on:click={() => activeTab = 'voice'}>Voice (TTS)</button>
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
                        <div class="proxies-container">
                            <div class="proxies-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <h3 style="margin: 0; font-size: 14px;">Proxy Profiles</h3>
                                <button class="primary" style="padding: 4px 8px; font-size: 12px; border-radius: 4px; border: 1px solid var(--system-color); background: rgba(0,255,255,0.1); color: var(--system-color); cursor: pointer;" on:click={addProxy}>+ Add Proxy</button>
                            </div>
                            
                            <div class="proxies-list" style="display: flex; flex-direction: column; gap: 15px; max-height: 400px; overflow-y: auto; padding-right: 5px;">
                                {#each tempSettings.proxies as proxy, i}
                                    <div class="proxy-card" style="border: 1px solid var(--input-border); padding: 12px; border-radius: 6px; background: rgba(0,0,0,0.2); position: relative;">
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid var(--input-border); padding-bottom: 8px;">
                                            <div style="font-weight: bold; color: var(--text-color);">Editing: {proxy.name || 'Unnamed Proxy'}</div>
                                            <div style="display: flex; gap: 8px; align-items: center;">
                                                <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; cursor: pointer;">
                                                    <input type="radio" name="activeProxy" checked={proxy.isActive} on:change={() => setProxyActive(i)}> Active
                                                </label>
                                                <button style="background: none; border: none; color: #ff5555; cursor: pointer; font-size: 11px;" on:click={() => deleteProxy(i)}>Delete</button>
                                            </div>
                                        </div>
                                        
                                        <div class="settings-group">
                                            <label>Name</label>
                                            <input type="text" bind:value={proxy.name} placeholder="e.g., Gemini">
                                        </div>

                                        <div class="settings-group">
                                            <label>Proxy URL</label>
                                            <input type="text" bind:value={proxy.proxyUrl} placeholder="https://generativelanguage.googleapis.com/v1beta/openai/">
                                        </div>

                                        <div class="settings-group">
                                            <label style="display: flex; justify-content: space-between;">API key <button style="background: none; border: none; color: var(--system-color); cursor: pointer; font-size: 11px;" on:click={() => showKeys[i] = !showKeys[i]}>{showKeys[i] ? 'Hide' : 'Show'}</button></label>
                                            <input type={showKeys[i] ? "text" : "password"} bind:value={proxy.apiKey} placeholder="Enter API Key">
                                        </div>

                                        <div class="settings-group">
                                            <label>Model</label>
                                            <input type="text" bind:value={proxy.model} placeholder="gemini-3.5-flash-lite">
                                        </div>

                                        <div class="settings-group">
                                            <label>Custom prompt <span style="opacity: 0.5; font-size: 10px;">(Sent only while this proxy is active)</span></label>
                                            <textarea bind:value={proxy.customPrompt} placeholder="System prompt injection..." rows="3" style="width: 100%; resize: vertical; padding: 6px; border-radius: 4px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-color); font-family: 'DM Mono', monospace; font-size: 11px;"></textarea>
                                        </div>
                                    </div>
                                {/each}
                            </div>
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
                    {:else if activeTab === 'voice'}
                        <div class="settings-group checkbox">
                            <label><input type="checkbox" bind:checked={tempSettings.enableVoice}> Enable Voice Synthesis</label>
                        </div>
                        {#if tempSettings.enableVoice}
                            <div class="settings-group">
                                <label for="elevenlabs_key">ElevenLabs API Key:</label>
                                <input id="elevenlabs_key" type="password" bind:value={tempSettings.elevenLabsApiKey} placeholder="Enter API Key">
                            </div>
                            <div class="settings-group">
                                <label for="elevenlabs_voice">Voice ID (Optional):</label>
                                <input id="elevenlabs_voice" type="text" bind:value={tempSettings.elevenLabsVoiceId} placeholder="Default voice used if empty">
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
            
            <button class="modal-save-btn" on:click={handleSave}>[ SAVE ]</button>
        </div>
    </div>
{/if}
