import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

import ffmpeg from "fluent-ffmpeg"

export async function cropBase64Video({
  base64Video,
  width,
  height,
}: {
  base64Video: string;
  width: number;
  height: number;
}): Promise<string> {
  // Create a buffer from the base64 string, skipping the data URI scheme
  const base64Data = base64Video.replace(/^data:video\/mp4;base64,/, "");
  const videoBuffer = Buffer.from(base64Data, "base64");

  // Create a temporary file for the input video
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ffmpeg-crop-input-"));
  const inputVideoPath = path.join(tempDir, `input.mp4`);
  await fs.writeFile(inputVideoPath, videoBuffer);

  // Create a temporary file for the output video
  const outputTempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ffmpeg-crop-output-"));
  const outputVideoPath = path.join(outputTempDir, `output-cropped.mp4`);

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

        const { width: inWidth, height: inHeight } = videoStream;
        const x = Math.floor(((inWidth || 0) - width) / 2);
        const y = Math.floor(((inHeight || 0) - height) / 2);

        ffmpeg(inputVideoPath)
          .outputOptions([
            `-vf crop=${width}:${height}:${x}:${y}`
          ])
          .on("error", (err) => {
            reject(new Error(`Error cropping video: ${err.message}`));
          })
          .on("end", () => {
            resolve(outputVideoPath);
          })
          .on('codecData', (data) => {
            console.log('Input is ' + data.audio + ' audio ' +
              'with ' + data.video + ' video');
          })
          .save(outputVideoPath);
      });
  });
}