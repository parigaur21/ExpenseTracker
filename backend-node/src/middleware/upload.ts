// src/middleware/upload.ts
import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure tmp directory exists
const tmpDir = path.resolve(__dirname, "../../tmp");
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, tmpDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

export const upload = multer({ storage });
