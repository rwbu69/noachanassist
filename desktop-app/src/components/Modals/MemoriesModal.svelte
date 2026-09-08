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
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h2>[ CORE MEMORIES ]</h2>
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <span class="close-btn" on:click={onClose}>[X]</span>
            </div>
            <p style="font-size: 13px; color: var(--label-color); margin-top: 0;">This is everything Noa knows about you. Edit or delete facts as needed.</p>
            <textarea 
                bind:value={localMemories}
                style="width: 100%; height: 300px; background: var(--input-bg); color: var(--text-color); border: 1px solid var(--input-border); padding: 10px; font-family: inherit; font-size: 13px; resize: vertical; box-sizing: border-box; border-radius: 4px;">
            </textarea>
            <button 
                class="modal-save-btn"
                on:click={saveMemories}>
                [ SAVE MEMORIES ]
            </button>
        </div>
    </div>
{/if}
