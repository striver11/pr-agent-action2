import OpenAI from "openai";
export async function chatCompletion(messages, opts, onStreamChunk) {
    const client = new OpenAI({ apiKey: opts.apiKey });
    const params = {
        model: opts.model,
        messages: messages,
        temperature: opts.temperature ?? 0.2,
        stream: opts.stream ?? false,
    };
    if (opts.tools && opts.tools.length > 0) {
        params.tools = opts.tools;
    }
    const timeoutMs = opts.timeoutMs ?? 60000;
    // Streaming mode can be implemented later when needed.
    if (opts.stream) {
        throw new Error("Streaming mode not yet implemented in openai provider");
    }
    const responsePromise = client.chat.completions.create(params);
    const timeoutPromise = new Promise((_r, rej) => setTimeout(() => rej(new Error("OpenAI request timed out")), timeoutMs));
    const res = await Promise.race([responsePromise, timeoutPromise]);
    return res.choices?.[0]?.message?.content ?? "";
}
