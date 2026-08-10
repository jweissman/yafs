type ChatDelta = { choices?: Array<{ delta?: { content?: string } }> };
type StreamState = { buffer: string; raw: string; full: string };
type Pump = {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  decoder: TextDecoder;
  state: StreamState;
  onDelta?: (delta: string) => void;
};

export async function readStream(
  body: ReadableStream<Uint8Array>,
  onDelta?: (delta: string) => void,
) {
  const state: StreamState = { buffer: "", raw: "", full: "" };
  await drain(pumpFor(body, state, onDelta));
  flushRemainder(state, onDelta);
  return state;
}

function pumpFor(
  body: ReadableStream<Uint8Array>,
  state: StreamState,
  onDelta?: (delta: string) => void,
): Pump {
  const reader = body.getReader();
  return { reader, decoder: new TextDecoder(), state, onDelta };
}

async function drain(pump: Pump) {
  const next = await pump.reader.read();
  if (next.done) {
    return;
  }
  const text = pump.decoder.decode(next.value, { stream: true });
  applyChunk(pump.state, text, pump.onDelta);
  await drain(pump);
}

function applyChunk(
  state: StreamState,
  text: string,
  onDelta?: (delta: string) => void,
) {
  state.raw += text;
  state.buffer += text;
  applyEvents(state, onDelta);
}

function applyEvents(state: StreamState, onDelta?: (delta: string) => void) {
  const { events, rest } = splitEvents(state.buffer);
  state.buffer = rest;
  events.forEach((event) => applyEvent(state, event, onDelta));
}

function splitEvents(buffer: string) {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  return { events: parts, rest };
}

function applyEvent(
  state: StreamState,
  event: string,
  onDelta?: (delta: string) => void,
) {
  const delta = deltaFrom(event);
  if (delta) {
    applyDelta(state, delta, onDelta);
  }
}

function applyDelta(
  state: StreamState,
  delta: string,
  onDelta?: (delta: string) => void,
) {
  state.full += delta;
  onDelta?.(delta);
}

function flushRemainder(state: StreamState, onDelta?: (delta: string) => void) {
  if (state.buffer.trim()) {
    applyEvent(state, state.buffer, onDelta);
  }
}

function deltaFrom(event: string): string | undefined {
  const line = dataLine(event);
  return line && line !== "[DONE]" ? parsedDelta(line) : undefined;
}

function dataLine(event: string): string | undefined {
  const line = event.split("\n").find((entry) => entry.startsWith("data:"));
  return line?.slice("data:".length).trim();
}

function parsedDelta(line: string): string | undefined {
  try {
    return (JSON.parse(line) as ChatDelta).choices?.[0]?.delta?.content;
  } catch {
    return undefined;
  }
}
