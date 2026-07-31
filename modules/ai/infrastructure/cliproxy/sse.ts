export async function* decodeSseData(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines: string[] = [];

  const consumeLine = (line: string): string | undefined => {
    if (line.length === 0) {
      if (dataLines.length === 0) {
        return undefined;
      }

      const payload = dataLines.join("\n");
      dataLines = [];
      return payload;
    }

    if (line.startsWith(":")) {
      return undefined;
    }

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);

    if (field !== "data") {
      return undefined;
    }

    let value = colon === -1 ? "" : line.slice(colon + 1);

    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    dataLines.push(value);
    return undefined;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf("\n");

      while (newline !== -1) {
        const rawLine = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
        const payload = consumeLine(line);

        if (payload !== undefined) {
          yield payload;
        }

        newline = buffer.indexOf("\n");
      }
    }

    if (buffer.length > 0) {
      const line = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
      const payload = consumeLine(line);

      if (payload !== undefined) {
        yield payload;
      }
    }

    const finalPayload = consumeLine("");

    if (finalPayload !== undefined) {
      yield finalPayload;
    }
  } finally {
    reader.releaseLock();
  }
}
