import { handleApi } from "./api.js";
import { handleInbound, type ForwardableEmailMessage } from "./inbound.js";
import { handleQueue } from "./queue.js";
import type { Env, QueueTask } from "./types.js";

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleApi(request, env);
  },
  email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    return handleInbound(message, env);
  },
  queue(batch: MessageBatch<QueueTask>, env: Env): Promise<void> {
    return handleQueue(batch, env);
  },
} satisfies ExportedHandler<Env, QueueTask>;
