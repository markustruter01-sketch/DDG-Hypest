import { createServer as createHttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import { createServer as createViteServer } from "vite";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("PORT must be a positive integer.");
}

const app = express();
const server = createHttpServer(app);

if (process.env.NODE_ENV === "production") {
  const publicDirectory = path.join(projectRoot, "dist", "public");
  app.use(express.static(publicDirectory, { index: false }));
  app.use((_request, response, next) => {
    response.sendFile(path.join(publicDirectory, "index.html"), (error) => {
      if (error) next(error);
    });
  });
} else {
  const vite = await createViteServer({
    configFile: path.join(projectRoot, "vite.config.ts"),
    server: {
      middlewareMode: true,
      hmr: { server },
    },
  });

  app.use(vite.middlewares);
  server.on("close", () => {
    void vite.close();
  });
}

server.listen(port, "0.0.0.0");
