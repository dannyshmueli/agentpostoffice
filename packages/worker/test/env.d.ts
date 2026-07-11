declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    MAIL_BUCKET: R2Bucket;
    MAIL_QUEUE: Queue;
    EMAIL: { send(message: unknown): Promise<{ messageId: string }> };
    MAIL_DOMAIN: string;
    MAX_INBOUND_BYTES: string;
    BODY_EXCERPT_BYTES: string;
    DLQ_NAME: string;
    TEST_MIGRATIONS: D1Migration[];
  }
}
