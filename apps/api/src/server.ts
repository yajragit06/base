import { buildApp } from "./app.js";

const app = buildApp({ logger: true });
const port = Number(process.env.PORT ?? 4000);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ host: "0.0.0.0", port });
