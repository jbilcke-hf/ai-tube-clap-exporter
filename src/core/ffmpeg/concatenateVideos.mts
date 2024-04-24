import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { v4 as uuidv4 } from "uuid";
import ffmpeg, { FfmpegCommand } from "fluent-ffmpeg";

import { getMediaInfo } from "./getMediaInfo.mts";

export type ConcatenateVideoOutput = {
  filepath: string;
  durationInSec: number;
}

export async function concatenateVideos({
  output,
  videoFilePaths = [],
}: {
  output?: string;

  // those are videos PATHs, not base64 strings!
  videoFilePaths: string[];
}): Promise<ConcatenateVideoOutput> {
  if (!Array.isArray(videoFilePaths)) {
    throw new Error("Videos must be provided in an array");
  }

  videoFilePaths = videoFilePaths.filter((videoPath) => existsSync(videoPath))

  // Create a temporary working directory
  const tempDir = path.join(os.tmpdir(), uuidv4());
  await fs.mkdir(tempDir);

  const filePath = output ? output : path.join(tempDir, `${uuidv4()}.mp4`);

  if (!filePath) {
    throw new Error("Failed to generate a valid temporary file path");
  }

  let cmd: FfmpegCommand = ffmpeg();

  videoFilePaths.forEach((video) => {
    cmd = cmd.addInput(video)
  })

  return new Promise<{ filepath: string; durationInSec: number }>(
    (resolve, reject) => {
      cmd
        .on('error', reject)
        .on('end', async () => {
          try {
            const { durationInSec } = await getMediaInfo(filePath);
            resolve({ filepath: filePath, durationInSec });
          } catch (err) {
            reject(err);
          }
        })
        .mergeToFile(filePath, tempDir);
    }
  );
};
