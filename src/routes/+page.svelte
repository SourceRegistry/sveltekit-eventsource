<script lang="ts">

    import {onMount} from "svelte";
    import {EventSource} from "$lib/client/index.js";

    const events = $state<number[]>([]);
    let eventsource_state = $state<"open" | "closed">("closed");

    onMount(() => {
        const eventSource = new EventSource<'status'>('./sse')
        eventSource.onOpen(() => eventsource_state = "open")
        eventSource.onClose(() => {
            console.log("CLOSED");
            eventsource_state = "closed"
        })

        eventSource.on('heartbeat', (data) => {
            //Add event data to list;
            events.push(data)
        })
    })

</script>


<h1>Welcome to @sourceregistry/sveltekit-eventsource</h1>

<span>
    Connection state: {eventsource_state === 'open' ? '🟢' : '🔴'}
</span>

<ul id="event-list">
    {#each events as event, i}
        <li id="event-{i}">{event}</li>
    {/each}
</ul>
