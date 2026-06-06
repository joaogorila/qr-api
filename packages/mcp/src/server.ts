#!/usr/bin/env node
/**
 * @flipt/qr-api-mcp — MCP server stdio para a QR-API
 * Expoe tools nativas para Claude Code, Cursor, Cline, Windsurf e qualquer cliente MCP.
 *
 * Uso:
 *   QR_API_KEY=sk_live_xxx npx @flipt/qr-api-mcp
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { QrApi, QrApiError } from "@flipt/qr-api";

// ---------------------------------------------------------------------------
// Validacao de env
// ---------------------------------------------------------------------------

const QR_API_KEY = process.env.QR_API_KEY;
if (!QR_API_KEY) {
  process.stderr.write(
    "[qr-api-mcp] ERRO: variavel de ambiente QR_API_KEY nao definida.\n" +
    "Defina QR_API_KEY=sk_live_xxx no env do MCP server.\n"
  );
  process.exit(1);
}

const QR_API_BASE_URL =
  process.env.QR_API_BASE_URL ?? "https://api.qrapi.flipt.com.br/v1";

// ---------------------------------------------------------------------------
// Cliente SDK
// ---------------------------------------------------------------------------

const qr = new QrApi({
  apiKey: QR_API_KEY,
  baseUrl: QR_API_BASE_URL,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatError(err: unknown): string {
  if (err instanceof QrApiError) {
    const parts = [`[${err.code}] ${err.message}`];
    if (err.param) parts.push(`param: ${err.param}`);
    if (err.requestId) parts.push(`request_id: ${err.requestId}`);
    if (err.docUrl) parts.push(`docs: ${err.docUrl}`);
    return parts.join(" | ");
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

function ok(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function fail(err: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return {
    content: [{ type: "text" as const, text: `Erro: ${formatError(err)}` }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

// Cria uma instancia do servidor MCP com todas as tools/resources registradas.
// Fabrica (nao singleton) para o modo HTTP poder criar uma por requisicao (stateless).
export function buildServer() {
  const server = new McpServer(
  {
    name: "qr-api",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// ---------------------------------------------------------------------------
// Tool: qr_send_message
// ---------------------------------------------------------------------------

server.registerTool(
  "qr_send_message",
  {
    title: "Enviar mensagem WhatsApp",
    description:
      "Envia uma mensagem WhatsApp via QR-API. Suporta texto, imagem, video, audio, documento, localizacao, contato, botoes, lista, enquete, PIX, reacao e resposta.",
    inputSchema: {
      instanceId: z.string().describe("ID da instancia conectada (ex: inst_abc123)"),
      to: z.string().describe("Numero destino em E.164 (ex: 5511999998888)"),
      type: z
        .enum([
          "text",
          "image",
          "video",
          "audio",
          "document",
          "location",
          "contact",
          "sticker",
          "buttons",
          "list",
          "poll",
          "pix",
          "reaction",
          "reply",
        ])
        .describe("Tipo da mensagem"),
      text: z.string().optional().describe("Conteudo textual (type=text ou reply)"),
      mediaUrl: z
        .string()
        .optional()
        .describe("URL da midia (type=image/video/audio/document/sticker)"),
      caption: z.string().optional().describe("Legenda da midia"),
      externalId: z
        .string()
        .optional()
        .describe("ID externo para dedup/rastreio"),
      delayTyping: z
        .number()
        .optional()
        .describe("Simula digitacao por N ms antes de enviar (anti-ban)"),
      scheduledAt: z
        .string()
        .optional()
        .describe("ISO8601 para agendar o envio"),
    },
  },
  async (args) => {
    try {
      const result = await qr.messages.send({
        instanceId: args.instanceId,
        to: args.to,
        type: args.type as Parameters<typeof qr.messages.send>[0]["type"],
        text: args.text,
        media: args.mediaUrl ? { url: args.mediaUrl } : undefined,
        caption: args.caption,
        externalId: args.externalId,
        delayTyping: args.delayTyping,
        scheduledAt: args.scheduledAt,
      });
      return ok({ mensagem_id: result.id, status: result.status, request_id: result.request_id });
    } catch (err) {
      return fail(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: qr_send_bulk
// ---------------------------------------------------------------------------

server.registerTool(
  "qr_send_bulk",
  {
    title: "Envio em lote WhatsApp",
    description:
      "Envia mensagens de texto em lote para varios numeros. Pacing anti-ban automatico (3-8s entre mensagens). Ideal para campanhas e notificacoes em massa.",
    inputSchema: {
      instanceId: z.string().describe("ID da instancia conectada"),
      messages: z
        .array(
          z.object({
            to: z.string().describe("Numero destino E.164"),
            text: z.string().describe("Texto da mensagem"),
          })
        )
        .min(1)
        .describe("Lista de mensagens (minimo 1)"),
    },
  },
  async (args) => {
    try {
      const result = await qr.messages.sendBulk({
        instanceId: args.instanceId,
        messages: args.messages.map((m) => ({
          to: m.to,
          type: "text" as const,
          text: m.text,
        })),
      });
      return ok({
        total: result.messages.length,
        mensagens: result.messages.map((m) => ({
          id: m.id,
          status: m.status,
        })),
      });
    } catch (err) {
      return fail(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: qr_message_status
// ---------------------------------------------------------------------------

server.registerTool(
  "qr_message_status",
  {
    title: "Status de mensagem",
    description:
      "Consulta o status atual de uma mensagem. Estados possíveis: queued, scheduled, sending, sent, delivered, read, failed, cancelled.",
    inputSchema: {
      messageId: z.string().describe("ID da mensagem (ex: msg_abc123)"),
    },
  },
  async (args) => {
    try {
      const msg = await qr.messages.get(args.messageId);
      return ok({
        id: msg.id,
        status: msg.status,
        instanceId: msg.instanceId,
        to: msg.to,
        type: msg.type,
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
      });
    } catch (err) {
      return fail(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: qr_create_instance
// ---------------------------------------------------------------------------

server.registerTool(
  "qr_create_instance",
  {
    title: "Criar instancia WhatsApp",
    description:
      "Cria uma nova instancia de WhatsApp. Apos criar, use qr_get_qr para obter o QR code e escanear no WhatsApp.",
    inputSchema: {
      name: z
        .string()
        .optional()
        .describe("Nome amigavel da instancia (ex: loja-principal)"),
      inboundMode: z
        .enum(["off", "webhook", "followfy"])
        .optional()
        .describe("Como processar mensagens recebidas (padrao: off)"),
      dailyLimit: z
        .number()
        .optional()
        .describe("Limite diario de mensagens enviadas"),
      webhookUrl: z
        .string()
        .optional()
        .describe("URL para receber eventos (necessario se inboundMode=webhook)"),
    },
  },
  async (args) => {
    try {
      const instance = await qr.instances.create({
        name: args.name,
        inboundMode: args.inboundMode,
        dailyLimit: args.dailyLimit,
        webhookUrl: args.webhookUrl,
      });
      return ok({
        id: instance.id,
        status: instance.status,
        healthScore: instance.healthScore,
        proximo_passo:
          `Use a tool qr_get_qr com instanceId="${instance.id}" para obter o QR code e conectar o WhatsApp.`,
      });
    } catch (err) {
      return fail(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: qr_get_qr
// ---------------------------------------------------------------------------

server.registerTool(
  "qr_get_qr",
  {
    title: "Obter QR code da instancia",
    description:
      "Retorna o QR code (imagem base64 e instrucoes) para conectar o WhatsApp na instancia. Escaneie com o celular em WhatsApp > Aparelhos conectados > Conectar aparelho.",
    inputSchema: {
      instanceId: z.string().describe("ID da instancia"),
    },
  },
  async (args) => {
    try {
      const { qr: qrBase64, expiresAt } = await qr.instances.qr(args.instanceId);
      // Retorna tanto imagem quanto instrucoes de texto
      return {
        content: [
          {
            type: "image" as const,
            data: qrBase64,
            mimeType: "image/png" as const,
          },
          {
            type: "text" as const,
            text: [
              `QR code para a instancia: ${args.instanceId}`,
              `Expira em: ${expiresAt}`,
              ``,
              `Como escanear:`,
              `1. Abra o WhatsApp no seu celular`,
              `2. Toque em Mais opcoes (3 pontos) > Aparelhos conectados`,
              `3. Toque em Conectar aparelho`,
              `4. Aponte a camera para o QR code acima`,
              ``,
              `Apos escanear, a instancia ficara com status "connected".`,
              `Use qr_instance_status para verificar o status.`,
            ].join("\n"),
          },
        ],
      };
    } catch (err) {
      return fail(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: qr_instance_status
// ---------------------------------------------------------------------------

server.registerTool(
  "qr_instance_status",
  {
    title: "Status da instancia",
    description:
      "Verifica o status atual de uma instancia WhatsApp, incluindo healthScore e telefone conectado.",
    inputSchema: {
      instanceId: z.string().describe("ID da instancia"),
    },
  },
  async (args) => {
    try {
      const instance = await qr.instances.get(args.instanceId);
      return ok({
        id: instance.id,
        status: instance.status,
        healthScore: instance.healthScore,
        telefone: instance.phone ?? "nao conectado",
        inboundMode: instance.inboundMode,
        dailyLimit: instance.dailyLimit,
        createdAt: instance.createdAt,
      });
    } catch (err) {
      return fail(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: qr_check_number
// ---------------------------------------------------------------------------

server.registerTool(
  "qr_check_number",
  {
    title: "Verificar numero WhatsApp",
    description:
      "Verifica se um numero de telefone tem WhatsApp. Use antes de enviar mensagens para evitar erros.",
    inputSchema: {
      number: z
        .string()
        .describe(
          "Numero de telefone em formato E.164 (ex: 5511999998888). Sem espacos ou caracteres especiais."
        ),
    },
  },
  async (args) => {
    try {
      const result = await qr.phones.exists(args.number);
      return ok({
        numero: result.number,
        tem_whatsapp: result.exists,
        mensagem: result.exists
          ? "Numero tem WhatsApp, pode enviar mensagens."
          : "Numero nao tem WhatsApp registrado.",
      });
    } catch (err) {
      return fail(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: qr_register_webhook
// ---------------------------------------------------------------------------

server.registerTool(
  "qr_register_webhook",
  {
    title: "Registrar webhook",
    description:
      "Registra um endpoint para receber eventos em tempo real (mensagens recebidas, status de mensagens, status de instancia). O servidor assina com HMAC X-Qr-Signature para validacao.",
    inputSchema: {
      url: z
        .string()
        .url()
        .describe("URL publica que receberao os eventos POST (ex: https://minha-api.com.br/webhook)"),
      events: z
        .array(
          z.enum([
            "message.received",
            "message.status",
            "instance.status",
            "instance.qr",
          ])
        )
        .min(1)
        .describe("Eventos a subscrever"),
      secret: z
        .string()
        .optional()
        .describe(
          "Segredo para verificar a assinatura HMAC do header X-Qr-Signature (recomendado)"
        ),
    },
  },
  async (args) => {
    try {
      const webhook = await qr.webhooks.create({
        url: args.url,
        events: args.events as Parameters<typeof qr.webhooks.create>[0]["events"],
        secret: args.secret,
      });
      return ok({
        id: webhook.id,
        url: webhook.url,
        eventos: webhook.events,
        createdAt: webhook.createdAt,
        dica: args.secret
          ? "Valide a assinatura HMAC no header X-Qr-Signature para seguranca."
          : "AVISO: sem secret, nao ha validacao de autenticidade. Considere adicionar um secret.",
      });
    } catch (err) {
      return fail(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: qr_list_instances
// ---------------------------------------------------------------------------

server.registerTool(
  "qr_list_instances",
  {
    title: "Listar instancias",
    description: "Lista todas as instancias WhatsApp da conta com status e healthScore.",
    inputSchema: {
      limit: z
        .number()
        .optional()
        .describe("Numero maximo de instancias a retornar (padrao: 20)"),
      cursor: z
        .string()
        .optional()
        .describe("Cursor para paginacao (obtido do campo next_cursor da resposta anterior)"),
    },
  },
  async (args) => {
    try {
      const result = await qr.instances.list({
        limit: args.limit,
        cursor: args.cursor,
      });
      return ok({
        total: result.data.length,
        tem_mais: result.has_more,
        next_cursor: result.next_cursor,
        instancias: result.data.map((i) => ({
          id: i.id,
          status: i.status,
          healthScore: i.healthScore,
          telefone: i.phone ?? "nao conectado",
          inboundMode: i.inboundMode,
        })),
      });
    } catch (err) {
      return fail(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Resources MCP
// ---------------------------------------------------------------------------

server.registerResource(
  "docs-llms-full",
  "qrapi://docs/llms-full",
  {
    description:
      "Documentacao completa da QR-API otimizada para LLMs. Inclui autenticacao, todos os endpoints, payloads, erros e exemplos.",
    mimeType: "text/plain",
  },
  async (_uri) => ({
    contents: [
      {
        uri: "qrapi://docs/llms-full",
        text: [
          "QR-API — Documentacao LLM-first",
          "================================",
          "",
          "Documentacao completa disponivel em:",
          "https://docs.qrapi.flipt.com.br/llms-full.txt",
          "",
          "Resumo rapido:",
          "",
          "BASE URL: https://api.qrapi.flipt.com.br/v1",
          "AUTH: Authorization: Bearer sk_live_xxx  (ou sk_test_xxx para sandbox)",
          "",
          "PRINCIPAIS ENDPOINTS:",
          "  POST   /messages          — envia mensagem (text/image/video/etc)",
          "  POST   /messages/bulk     — lote com pacing anti-ban",
          "  GET    /messages/{id}     — status da mensagem",
          "  POST   /instances         — cria instancia",
          "  GET    /instances/{id}/qr — QR code (base64) para conectar",
          "  GET    /instances/{id}    — status + healthScore",
          "  GET    /phones/{n}/exists — numero tem WhatsApp?",
          "  POST   /webhooks          — registra webhook de saida",
          "  GET    /me                — info da chave",
          "",
          "ERROS: { error: { type, code, message, param, doc_url }, request_id }",
          "IDEMPOTENCY: header Idempotency-Key em todos os POSTs de envio",
          "PAGINACAO: cursor (campo next_cursor na resposta)",
          "",
          "SCOPES: messages:send, messages:read, instances:read, instances:write,",
          "        webhooks:write, phones:read, * (admin)",
          "",
          "Para a documentacao completa (todos os tipos de mensagem, exemplos, anti-ban):",
          "https://docs.qrapi.flipt.com.br/llms-full.txt",
        ].join("\n"),
        mimeType: "text/plain",
      },
    ],
  })
);

server.registerResource(
  "openapi",
  "qrapi://openapi",
  {
    description:
      "Contrato OpenAPI 3.1 da QR-API. Use para importar no Postman, Insomnia ou gerar SDKs.",
    mimeType: "application/json",
  },
  async (_uri) => ({
    contents: [
      {
        uri: "qrapi://openapi",
        text: JSON.stringify(
          {
            openapi: "3.1.0",
            info: {
              title: "QR-API",
              version: "1.0.0",
              description: "API de envio de mensagens WhatsApp via instancias QR/Evolution",
              contact: { url: "https://docs.qrapi.flipt.com.br" },
            },
            servers: [{ url: "https://api.qrapi.flipt.com.br/v1" }],
            security: [{ BearerAuth: [] }],
            components: {
              securitySchemes: {
                BearerAuth: { type: "http", scheme: "bearer" },
              },
            },
            externalDocs: {
              description: "Documentacao completa",
              url: "https://docs.qrapi.flipt.com.br",
            },
            info_nota:
              "OpenAPI completo disponivel em https://docs.qrapi.flipt.com.br/openapi.json",
          },
          null,
          2
        ),
        mimeType: "application/json",
      },
    ],
  })
);

  return server;
}

// ---------------------------------------------------------------------------
// Start — transporte stdio (local, IDEs) ou HTTP/SSE (remoto, web agents)
// ---------------------------------------------------------------------------

// Modo stdio: 1 servidor de longa duracao via stdin/stdout (Claude Code, Cursor, Cline, Windsurf).
async function startStdio() {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[qr-api-mcp] stdio iniciado. API: ${QR_API_BASE_URL}\n`
  );
}

// Modo HTTP/SSE remoto (stateless): util para Lovable/v0/agentes web que nao rodam
// processo local. Cada POST /mcp cria um servidor + transport efemero (Streamable HTTP).
async function startHttp(port: number) {
  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS basico (clientes web)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", transport: "http", api: QR_API_BASE_URL }));
      return;
    }

    if (!req.url || !req.url.startsWith("/mcp")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not_found", message: "Use POST /mcp" }));
      return;
    }

    try {
      // Le o corpo JSON da requisicao
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const raw = Buffer.concat(chunks).toString("utf8");
      const body = raw ? JSON.parse(raw) : undefined;

      // Stateless: 1 servidor + transport por requisicao
      const server = buildServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      process.stderr.write(`[qr-api-mcp] erro na requisicao HTTP: ${(err as Error).message}\n`);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null }));
      }
    }
  });

  httpServer.listen(port, () => {
    process.stderr.write(
      `[qr-api-mcp] HTTP/SSE remoto em http://0.0.0.0:${port}/mcp . API: ${QR_API_BASE_URL}\n`
    );
  });
}

async function main() {
  const mode = (process.env.MCP_TRANSPORT ?? (process.argv.includes("--http") ? "http" : "stdio")).toLowerCase();
  if (mode === "http") {
    await startHttp(parseInt(process.env.PORT ?? "8787", 10));
  } else {
    await startStdio();
  }
}

main().catch((err) => {
  process.stderr.write(`[qr-api-mcp] Falha ao iniciar: ${err.message}\n`);
  process.exit(1);
});
