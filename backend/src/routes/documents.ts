import { Router } from "express";
import multer from "multer";
import { requireAuth, requireWorkspaceMember } from "../middleware/auth.js";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { ingestDocument } from "../services/ingestion.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

documentsRouter.post(
  "/:workspaceId/documents",
  requireWorkspaceMember,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, "No file uploaded");

    const result = await ingestDocument({
      workspaceId: req.params.workspaceId,
      filename: req.file.originalname,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
    });

    res.status(result.reused ? 200 : 201).json(result);
  }),
);
