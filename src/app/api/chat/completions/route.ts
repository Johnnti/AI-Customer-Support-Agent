import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { env } from "@/config/env";
import { Logger } from "@/utils/logger"

const  logger = new Logger("API:Chat")

const gemini = new OpenAI({
  apiKey: env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
})

export async function POST(req: NextRequest) {
  const body = await req.json();
  try {
    const {
      model,
      messages,
      max_tokens,
      temperature,
      stream,
      call,
      ...restParams
    } = body;
    logger.info("Request received")
    // Validate messages
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "No messages provided" }, { status: 400 });
    }
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || !lastMessage.content) {
      return NextResponse.json({ error: "Last message missing content" }, { status: 400 });
    }

    const prompt = await gemini.chat.completions.create({
      model: "gemini-2.0-flash-lite",
      messages: [
        { role: "user",
          content:`
          Create a prompt which can act as a prompt template where I put the original prompt and it can modify it according to my intentions so that the final modified prompt is more detailed.You can expand certain terms or keywords.
          ----------
          PROMPT: ${lastMessage.content}.
          MODIFIED PROMPT: `
        }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const modifiedPromptContent = prompt.choices?.[0]?.message?.content;
    if (!modifiedPromptContent) {
      return NextResponse.json({ error: "Failed to generate modified prompt" }, { status: 500 });
    }

    const modifiedMessage = [
      ...messages.slice(0, messages.length - 1),
      { ...lastMessage, content: modifiedPromptContent },
    ];

    if (stream) {
      const completionStream = await gemini.chat.completions.create({
        model: "gemini-2.0-flash-lite",
        messages: modifiedMessage,
        max_tokens: max_tokens || 150,
        temperature: temperature || 0.7,
        stream: true,
      } as OpenAI.Chat.ChatCompletionCreateParamsStreaming);

      const encoder = new TextEncoder();
      const streamBody = new ReadableStream({
        async start(controller) {
          for await (const data of completionStream) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          }
          controller.close();
        }
      });
      return new NextResponse(streamBody, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        }
      });
    } else {
      const completion = await gemini.chat.completions.create({
        model: "gemini-2.0-flash-lite",
        messages: modifiedMessage,
        max_tokens: max_tokens || 150,
        temperature: temperature || 0.7,
        stream: false,
      });
      return NextResponse.json(completion)
    }
  } catch (e: any) {
    // Provide better error message
    console.error("Chat completion error:", e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}