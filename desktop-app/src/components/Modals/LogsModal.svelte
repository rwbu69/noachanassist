<script>
    import { terminalLogs } from '../../store.js';
    import { onMount, afterUpdate } from 'svelte';

    export let isOpen = false;
    export let onClose;

    let logContainer;

    onMount(() => {
        if (window.__TAURI__ && window.__TAURI__.event) {
            window.__TAURI__.event.listen('backend-log', (event) => {
                if ($terminalLogs === 'Waiting for backend connection...\n') {
                    terminalLogs.set('');
                }
                const cleanText = event.payload.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r?\n$/, '');
                terminalLogs.update(logs => logs + cleanText + '\n');
            });
        }
    });

    afterUpdate(() => {
        if (logContainer && isOpen) {
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    });
</script>

{#if isOpen}
    <div class="overlay" style="display: flex;">
        <div class="modal-content" style="max-width: 800px; height: 80vh;">
            <div class="modal-header">
                <h2>[ BACKEND TERMINAL ]</h2>
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <span class="close-btn" on:click={onClose}>[X]</span>
            </div>
            <div id="terminal-log" bind:this={logContainer}>
                {$terminalLogs}
            </div>
        </div>
    </div>
{/if}
