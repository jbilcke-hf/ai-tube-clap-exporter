
import { mkdtemp, stat, writeFile, readFile } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { Buffer } from "node:buffer"

import ffmpeg from "fluent-ffmpeg"

export async function convertMp4ToWebm({
  input,
  outputVideoPath,
  asBase64 = false,
}: {
  input: string;
  outputVideoPath?: string;
  asBase64?: boolean;
}): Promise<string> {
  let inputFilePath = input;

  // Check if the input is a base64 string
  if (input.startsWith("data:")) {
    const base64Data = input.split(",")[1];
    const inputBuffer = Buffer.from(base64Data, "base64");

    // Create a temporary file for the input video
    const tempDir = await mkdtemp(path.join(tmpdir(), "ffmpeg-input-"));
    inputFilePath = path.join(tempDir, "temp.mp4");

    // Write the base64 data to the temporary file
    await writeFile(inputFilePath, inputBuffer);
  } else {
    // Verify that the input file exists
    const inputFileStats = await stat(inputFilePath);
    if (!inputFileStats.isFile()) {
      throw new Error(`Input video file does not exist: ${inputFilePath}`);
    }
  }

  // If no output path is provided, create a temporary file for the output
  if (!outputVideoPath) {
    const tempDir = await mkdtemp(path.join(tmpdir(), "ffmpeg-output-"));
    outputVideoPath = path.join(tempDir, `${path.parse(inputFilePath).name}.webm`);
  }

  return new Promise((resolve, reject) => {
    ffmpeg(inputFilePath)
      .toFormat("webm")
      .videoCodec("libvpx")
      .addOption("-b:v", "1000k") // ~ 400 kB for 3 seconds of video
      .audioCodec("libvorbis")
      .on("error", (err) => {
        reject(new Error(`Error converting video to WebM: ${err.message}`));
      })
      .on("end", async () => {
        if (asBase64) {
          try {
            const videoBuffer = await readFile(outputVideoPath);
            const videoBase64 = `data:video/webm;base64,${videoBuffer.toString("base64")}`;
            resolve(videoBase64);
          } catch (error) {
            reject(new Error(`Error reading video file: ${(error as Error).message}`));
          }
        } else {
          resolve(outputVideoPath);
        }
      })
      .save(outputVideoPath);
  });
}