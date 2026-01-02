import {EventSource} from "$lib/server/index.js";
import {setInterval} from "node:timers";


export const GET = () => {
    const sse = new EventSource('status');
    let timer: NodeJS.Timeout;
    sse.once('close', () => {
        console.log('Closed');
        clearInterval(timer);
    })
    timer = setInterval(() => {
        console.log('send heartbeat');
        sse.emit('heartbeat', Date.now())
    }, 2000)

    setTimeout(() => {
        sse.stop();
        timer.close();
    }, 5000)
    return sse.response();
}
