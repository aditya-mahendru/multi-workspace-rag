import express from "express";
import cors from "cors";
import { env, corsOrigins } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { workspacesRouter } from "./routes/workspaces.js";
import { documentsRouter } from "./routes/documents.js";
import { chatRouter } from "./routes/chat.js";
import { toolLogsRouter } from "./routes/toolLogs.js";
import { debugRouter } from "./routes/debug.js";

const app = express();

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/workspaces", workspacesRouter);
app.use("/workspaces", documentsRouter);
app.use("/workspaces", chatRouter);
app.use("/workspaces", toolLogsRouter);
app.use("/workspaces", debugRouter);

app.use(errorHandler);

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on port ${env.PORT}`);
});
