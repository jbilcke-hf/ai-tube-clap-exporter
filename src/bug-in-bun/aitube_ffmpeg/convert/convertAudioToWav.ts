import { mkdtemp, writeFile, readFile, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Buffer } from "node:buffer"

import ffmpeg from "fluent-ffmpeg"

type ConvertAudioToWavParams = {
  input: string;
  outputAudioPath?: string;
  asBase64?: boolean;
};

export async function convertAudioToWav({
  input,
  outputAudioPath,
  asBase64 = false,
}: ConvertAudioToWavParams): Promise<string> {
  let inputAudioPath = input;

  // Check if the input is a base64 string
  if (input.startsWith("data:")) {
    const matches = input.match(/^data:audio\/(mp3|wav);base64,(.+)$/);

    if (!matches) {
      throw new Error("Invalid base64 audio data");
    }

    const inputBuffer = Buffer.from(matches[2], "base64");
    const inputFormat = matches[1]; // Either 'mp3' or 'wav'
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "ffmpeg-input-"));
    inputAudioPath = path.join(tempDir, `temp.${inputFormat}`);

    // Write the base64 data to the temporary file
    await writeFile(inputAudioPath, inputBuffer);
  } else {
    // Verify that the input file exists
    if (!(await stat(inputAudioPath)).isFile()) {
      throw new Error(`Input audio file does not exist: ${inputAudioPath}`);
    }
  }

  // If no output path is provided, create a temporary file for the output
  if (!outputAudioPath) {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "ffmpeg-output-"));
    outputAudioPath = path.join(tempDir, `${path.parse(inputAudioPath).name}.wav`);
  }

  return new Promise((resolve, reject) => {
    ffmpeg(inputAudioPath)
      .toFormat("wav")
      .on("error", (err) => {
        reject(new Error(`Error converting audio to WAV: ${err.message}`));
      })
      .on("end", async () => {
        if (asBase64) {
          try {
            const audioBuffer = await readFile(outputAudioPath);
            const audioBase64 = `data:audio/wav;base64,${audioBuffer.toString("base64")}`;
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