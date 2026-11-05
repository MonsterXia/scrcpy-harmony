// Executed by a Node worker in the same app process, never by an external tool.
// Keep the native server's synchronous thread joins away from Electron's UI loop.
export const airplayWorkerSource = `
const { parentPort, workerData } = require('node:worker_threads');
const { Receiver } = require(workerData.modulePath);
let receiver, stopping = false, credits = 2, sequence = 0, gap = true;
const pending = new Set();
function finish() {
  if (stopping) return;
  stopping = true;
  try { receiver?.stop(); parentPort.postMessage({ type: 'stopped' }); }
  finally { parentPort.close(); }
}
parentPort.on('message', message => {
  if (message.type === 'stop') finish();
  else if (message.type === 'ack' && pending.delete(message.sequence)) credits++;
});
try {
  receiver = new Receiver();
  const port = receiver.start('Scrcpy Plus', workerData.identity, workerData.keyFile, event => {
    if (stopping) return;
    if (event.type === 'video') {
      if (!credits) { gap = true; return; }
      const current = ++sequence; pending.add(current); credits--;
      parentPort.postMessage({ ...event, sequence: current, reset: event.reset || gap });
      gap = false;
    } else {
      if (event.type === 'reset' || event.type === 'disconnected') gap = true;
      parentPort.postMessage(event);
    }
  });
  parentPort.postMessage({ type: 'ready', port });
} catch (error) {
  parentPort.postMessage({ type: 'error', message: 'AirPlay native initialization failed' });
  finish();
}
`
