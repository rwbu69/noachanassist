<script>
    import { coreMemories, ws } from '../../store.js';

    export let isOpen = false;
    export let onClose;

    let localMemories = "";
    
    $: if (isOpen) {
        if ($coreMemories) {
            localMemories = $coreMemories;
        } else {
            localMemories = "Loading memories...";
            if ($ws && $ws.readyState === WebSocket.OPEN) {
                $ws.send(JSON.stringify({ type: 'get_core_memory' }));
            }
        }
    }
    
    // Sync when store updates while modal is open
    $: if (isOpen && $coreMemories) {
        localMemories = $coreMemories;
    }

    function saveMemories() {
        if ($ws && $ws.readyState === WebSocket.OPEN) {
            $ws.send(JSON.stringify({ type: 'save_core_memory', content: localMemories }));
        }
        onClose();
    }
</script>

{#if isOpen}
    <div class="overlay" style="display: flex;">
        <div class="overlay-content" style="max-width: 600px; width: 90%;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); margin-bottom: 15px; padding-bottom: 10px;">
                <h2 style="border: none; padding: 0; margin: 0;">Core Memories</h2>
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div class="titlebar-button" style="font-size: 20px; color: var(--text-color); cursor: pointer;" on:click={onClose}>✕</div>
            </div>
            <p style="font-size: 13px; color: var(--label-color); margin-top: 0;">This is everything Noa knows about you. Edit or delete facts as needed.</p>
            <textarea 
                bind:value={localMemories}
                style="width: 100%; height: 300px; background: var(--input-bg); color: var(--text-color); border: 1px solid var(--input-border); padding: 10px; font-family: inherit; font-size: 13px; resize: vertical; box-sizing: border-box;">
            </textarea>
            <button 
                on:click={saveMemories}
                style="margin-top: 15px; background: var(--user-bubble-bg); border: none; color: #fff; padding: 10px; border-radius: 6px; cursor: pointer; font-family: inherit; font-weight: bold; transition: all 0.2s;">
                Save Memories
            </button>
        </div>
    </div>
{/if}
