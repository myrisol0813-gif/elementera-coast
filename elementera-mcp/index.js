import dotenv from "dotenv";
dotenv.config({ path: ".envv" });
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app = express();
app.use(express.json());

const server = new McpServer({
  name: "elementera-coast",
  version: "0.3.1",
});

server.registerTool(
  "ping",
  {
    title: "Ping Elementera Coast",
    description: "Check whether Elementera Coast MCP server is awake.",
    inputSchema: {
      message: z.string().optional(),
    },
  },
  async ({ message }) => {
    return {
      content: [
        {
          type: "text",
          text: `Elementera Coast is awake. Echo: ${message ?? "hello from the coast"}`,
        },
      ],
    };
  }
);

server.registerTool(
  "ask_relay",
  {
    title: "Ask OpenRouter relay",
    description: "Send one message to the configured OpenRouter model and return its reply.",
    inputSchema: {
      message: z.string(),
      system: z.string().optional(),
      model: z.string().optional(),
      max_tokens: z.number().optional(),
    },
  },
  async ({ message, system, model, max_tokens }) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const selectedModel = model || process.env.OPENROUTER_MODEL;

    if (!apiKey) {
      return {
        content: [
          {
            type: "text",
            text: "ask_relay is installed, but OPENROUTER_API_KEY is not set yet.",
          },
        ],
      };
    }

    if (!selectedModel) {
      return {
        content: [
          {
            type: "text",
            text: "ask_relay is installed, but OPENROUTER_MODEL is not set yet.",
          },
        ],
      };
    }

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://elementera-coast.local",
          "X-Title": "Elementera Coast",
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            {
              role: "system",
              content:
                system ||
                "You are a zero-memory relay inside Elementera Coast. Answer only from the current message. Do not claim persistent memory.",
            },
            {
              role: "user",
              content: message,
            },
          ],
          max_tokens: max_tokens || 300,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          content: [
            {
              type: "text",
              text: `OpenRouter relay error: ${response.status} ${data.error?.message || JSON.stringify(data)}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: data.choices?.[0]?.message?.content || "OpenRouter returned no text.",
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `OpenRouter relay exception: ${error.message}`,
          },
        ],
      };
    }
  }
);

app.get("/", (req, res) => {
  res.send("Elementera Coast MCP server is awake.");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    name: "elementera-coast",
    version: "0.3.1",
    tools: ["ping", "ask_relay"],
    relay_provider: "openrouter",
    has_openrouter_key: Boolean(process.env.OPENROUTER_API_KEY),
    has_openrouter_model: Boolean(process.env.OPENROUTER_MODEL),
    model: process.env.OPENROUTER_MODEL || null,
  });
});

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    transport.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Elementera Coast MCP server listening on port ${port}`);
  console.log("Tools: ping, ask_relay");
});
