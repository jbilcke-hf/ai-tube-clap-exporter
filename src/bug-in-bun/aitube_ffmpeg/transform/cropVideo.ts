import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

import ffmpeg from "fluent-ffmpeg"

export async function cropVideo({
  inputVideoPath,
  width,
  height,
  debug = false,
  asBase64 = false,
}: {
  inputVideoPath: string
  width: number
  height: number
  debug?: boolean
  asBase64?: boolean
}): Promise<string> {
  // Verify that the input file exists
  if (!(await fs.stat(inputVideoPath)).isFile()) {
    throw new Error(`Input video file does not exist: ${inputVideoPath}`);
  }

  // Create a temporary file for the output
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ffmpeg-crop-"));
  const outputVideoPath = path.join(tempDir, `${path.parse(inputVideoPath).name}-cropped.mp4`);

  // Return a promise that resolves with the path to the output cropped video file
  return new Promise((resolve, reject) => {
    ffmpeg(inputVideoPath)
      .ffprobe((err, metadata) => {
        if (err) {
          reject(new Error(`Error reading video metadata: ${err.message}`));
          return;
        }

        const videoStream = metadata.streams.find(s => s.codec_type === "video");
        if (!videoStream) {
          reject(new Error(`Cannot find video stream in file: ${inputVideoPath}`));
          return;
        }

        const { width: inWidth, height: inHeight } = videoStream
        
        const x = Math.floor(((inWidth || 0) - width) / 2)
        const y = Math.floor(((inHeight || 0) - height) / 2)

        ffmpeg(inputVideoPath)
          .outputOptions([
            `-vf crop=${width}:${height}:${x}:${y}`
          ])
          .on("error", (err) => {
            reject(new Error(`Error cropping video: ${err.message}`));
          })
          .on("end", async () => {
            if (!asBase64) {
              resolve(outputVideoPath)
              return
            }
            // Convert the output file to a base64 string
            try {
              const videoBuffer = await fs.readFile(outputVideoPath);
              const videoBase64 = `data:video/mp4;base64,${videoBuffer.toString('base64')}`;
              resolve(videoBase64);
            } catch (error) {
              reject(new Error(`Error loading the video file: ${error}`));
            } finally {
              // Clean up temporary files
              await fs.rm(tempDir, { recursive: true });
            }
          })
          .save(outputVideoPath);
      });
  });
}