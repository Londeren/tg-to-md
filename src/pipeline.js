import { renderHeader, renderLegend, renderMessage, renderSkippedSummary } from "./render.js";

/**
 * Drive one export through the render pipeline.
 *
 * @param {{ chats: AsyncIterable<{ meta: object, messages: AsyncIterable<object> }> }} parseResult
 * @param {(chunk: string) => void | Promise<void>} write
 * @returns {Promise<{
 *   chatCount: number,
 *   rendered: number,
 *   skippedTotal: number,
 *   firstMeta: object | null,
 * }>}
 */
export async function renderExport(parseResult, write) {
  const stats = { chatCount: 0, rendered: 0, skippedTotal: 0, firstMeta: null };
  let isFirstChat = true;
  for await (const { meta, messages } of parseResult.chats) {
    stats.chatCount++;
    if (stats.firstMeta === null) stats.firstMeta = meta;
    if (isFirstChat) {
      await write(renderLegend());
      await write("\n---\n\n");
    } else {
      await write("\n---\n\n");
    }
    isFirstChat = false;
    await write(renderHeader(meta));

    const skipped = new Map();
    for await (const msg of messages) {
      const block = renderMessage(msg);
      if (block === null) {
        if (msg.type === "service") {
          const key = msg.action ?? "unknown";
          skipped.set(key, (skipped.get(key) ?? 0) + 1);
          stats.skippedTotal++;
        }
        continue;
      }
      await write("\n" + block);
      stats.rendered++;
    }

    if (skipped.size > 0) {
      await write("\n---\n\n" + renderSkippedSummary(skipped) + "\n");
    }
  }
  return stats;
}
