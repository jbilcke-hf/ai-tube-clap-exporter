import { existsSync } from "node:fs"
import path from "node:path"

import ffmpeg from "fluent-ffmpeg"
import { v4 as uuidv4 } from "uuid"
import { getRandomDirectory } from "@aitube/io"

type AddImageToVideoParams = {
  inputVideoPath: string;
  inputImagePath: string;
  outputVideoPath?: string;
};

export async function addImageToVideo({
  inputVideoPath,
  inputImagePath,
  outputVideoPath,
}: AddImageToVideoParams): Promise<string> {
  // Verify that the input files exist
  if (!existsSync(inputVideoPath)) {
    throw new Error(`Input video file does not exist: ${inputVideoPath}`);
  }
  if (!existsSync(inputImagePath)) {
    throw new Error(`Input image file does not exist: ${inputImagePath}`);
  }

  // If no output path is provided, create a temporary file for output
  if (!outputVideoPath) {
    const tempDir = await getRandomDirectory()
    outputVideoPath = path.join(tempDir, `${uuidv4()}.mp4`);
  }

  // Return a promise that resolves with the path to the output video
  return new Promise((resolve, reject) => {
    ffmpeg(inputVideoPath)
      .input(inputImagePath)
      .complexFilter([
        {
          filter: "overlay",
          options: { x: "0", y: "0" }, // Overlay on the entire video frame
        }
      ])
      .on("error", (err) => {
        reject(new Error(`Error processing video: ${err.message}`));
      })
      .on("end", () => {
        resolve(outputVideoPath);
      })
      .save(outputVideoPath);
  });
}
