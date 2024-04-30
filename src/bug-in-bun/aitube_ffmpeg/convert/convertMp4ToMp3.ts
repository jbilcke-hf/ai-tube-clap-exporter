
import { mkdtemp, stat, writeFile, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { tmpdir } from "node:os"
import { Buffer } from "node:buffer"

import ffmpeg from "fluent-ffmpeg"

export async function convertMp4ToMp3({
  input,
  outputAudioPath,
  asBase64 = false,
}: {
  input: string;
  outputAudioPath?: string;
  asBase64?: boolean;
}): Promise<string> {
  let inputFilePath = input;

  // Check if the input is a base64 string
  if (input.startsWith("data:")) {
    const base64Data = input.split(",")[1];
    const inputBuffer = Buffer.from(base64Data, "base64");

    // Create a temporary file for the input video
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "ffmpeg-input-"));
    inputFilePath = path.join(tempDir, "temp.mp4");

    // Write the base64 data to the temporary file
    await writeFile(inputFilePath, inputBuffer);
  } else {
    // Verify that the input file exists
    if (!(await stat(inputFilePath)).isFile()) {
      throw new Error(`Input video file does not exist: ${inputFilePath}`);
    }
  }

  // If no output path is provided, create a temporary file for the output
  if (!outputAudioPath) {
    const tempDir = await mkdtemp(path.join(tmpdir(), "ffmpeg-output-"));
    outputAudioPath = path.join(tempDir, `${path.parse(inputFilePath).name}.mp3`);
  }

  return new Promise((resolve, reject) => {
    ffmpeg(inputFilePath)
      .toFormat("mp3")
      .on("error", (err) => {
        reject(new Error(`Error converting video to audio: ${err.message}`));
      })
      .on("end", async () => {
        if (asBase64) {
          try {
            const audioBuffer = await readFile(outputAudioPath);
            const audioBase64 = `data:audio/mp3;base64,${audioBuffer.toString("base64")}`;
            resolve(audioBase64);
          } catch (error) {
            reject(new Error(`Error reading audio file: ${(error as Error).message}`));
          }
        } else {
          resolve(outputAudioPath);
        }
      })
      .save(outputAudioPath);
  });
}