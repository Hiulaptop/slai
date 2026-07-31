import { describe, expect, it } from "vitest";

import { decodeSseData } from "./sse";

const encoder = new TextEncoder();

function streamFrom(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }

      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const payloads: string[] = [];

  for await (const payload of decodeSseData(stream)) {
    payloads.push(payload);
  }

  return payloads;
}

describe("decodeSseData", () => {
  it("decodes LF-delimited data events", async () => {
    await expect(collect(streamFrom("data: first\n\ndata: second\n\n"))).resolves.toEqual([
      "first",
      "second",
    ]);
  });

  it("decodes CRLF-delimited data events", async () => {
    await expect(
      collect(streamFrom("data: first\r\n\r\ndata: second\r\n\r\n")),
    ).resolves.toEqual(["first", "second"]);
  });

  it("ignores comment and non-data fields", async () => {
    await expect(
      collect(
        streamFrom(
          ": keep-alive\n",
          "event: message\n",
          "id: 7\n",
          "data: payload\n\n",
        ),
      ),
    ).resolves.toEqual(["payload"]);
  });

  it("decodes multiple events received in one chunk", async () => {
    await expect(
      collect(streamFrom("data: one\n\ndata: two\n\ndata: three\n\n")),
    ).resolves.toEqual(["one", "two", "three"]);
  });

  it("reassembles events split across network chunks", async () => {
    await expect(
      collect(streamFrom("da", "ta: spl", "it\r", "\n\r", "\n")),
    ).resolves.toEqual(["split"]);
  });

  it("joins multiple data lines with a newline", async () => {
    await expect(
      collect(streamFrom("data: first line\ndata: second line\n\n")),
    ).resolves.toEqual(["first line\nsecond line"]);
  });

  it("emits final buffered data when the stream closes", async () => {
    await expect(collect(streamFrom("data: final payload"))).resolves.toEqual([
      "final payload",
    ]);
  });
});
