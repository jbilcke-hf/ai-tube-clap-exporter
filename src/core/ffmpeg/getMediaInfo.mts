import ffmpeg from "fluent-ffmpeg";

import { tmpdir } from "node:os";
import { promises as fs } from "node:fs";
import { join } from "node:path";

export type MediaMetadata = {
  durationInSec: number;
  durationInMs: number;
  hasAudio: boolean;
};

/**
 * Get the media info of a base64 or file path
 * @param input 
 * @returns 
 */
export async function getMediaInfo(input: string): Promise<MediaMetadata> {
  // If the input is a base64 string
  if (input.startsWith("data:")) {
    // Extract the base64 content
    const base64Content = input.split(";base64,").pop();
    if (!base64Content) {
      throw new Error("Invalid base64 data");
    }

    // Decode the base64 content to a buffer
    const buffer = Buffer.from(base64Content, 'base64');

    // Generate a temporary file name
    const tempFileName = join(tmpdir(), `temp-media-${Date.now()}`);

    // Write the buffer to a temporary file
    await fs.writeFile(tempFileName, buffer);

    // Get metadata from the temporary file then delete the file
    try {
      return await getMetaDataFromPath(tempFileName);
    } finally {
      await fs.unlink(tempFileName);
    }
  }

  // If the input is a path to the file
  return await getMetaDataFromPath(input);
}

async function getMetaDataFromPath(filePath: string): Promise<MediaMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {

      let results = {
        durationInSec: 0,
        durationInMs: 0,
        hasAudio: false,
      }

      if (err) {
        console.error("getMediaInfo(): failed to analyze the source (might happen with empty files)")
        // reject(err);
        resolve(results);
        return;
      }

      try {
        results.durationInSec = metadata?.format?.duration || 0;
        results.durationInMs = results.durationInSec * 1000;
        results.hasAudio = (metadata?.streams || []).some((stream) => stream.codec_type === 'audio');

      } catch (err) {
        console.error(`getMediaInfo(): failed to analyze the source (might happen with empty files)`)
        results.durationInSec = 0
        results.durationInMs = 0
        results.hasAudio = false
      }
      resolve(results);
    });
  });
}