import { rm, mkdtemp, writeFile, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { v4 as uuidv4 } from "uuid"
import ffmpeg from 'fluent-ffmpeg'

export type ScaleVideoParams = {
  input: string;
  height: number;
  debug?: boolean;
  asBase64?: boolean;
}

/**
 * Rescale a video (either file or base 64) to a given height.
 * This returns a base64 video.
 * 
 * Some essential things to note in this implementation:
 * 
 * If the input is a valid base64 string, it gets decoded and stored as a temporary .mp4 file.
 * The ffmpeg.outputOptions includes the arguments for setting the output video height and keeping the aspect ratio intact. The -1 in scale=-1:${height} tells ffmpeg to preserve aspect ratio based on the height.
 * The output is a libx264-encoded MP4 video, matching typical browser support standards.
 * Upon completion, the temporary output file is read into a buffer, converted to a base64 string with the correct prefix, and then cleaned up by removing temporary files.
 * To call this function with desired input and height, you'd use it similarly to the provided convertMp4ToMp3 function example, being mindful that input must be a file path or properly-formatted base64 string and height is a number representing the new height of the video.
 * 
 * @param param0 
 * @returns 
 */
export async function scaleVideo({
  input,
  height,
  asBase64 = false,
  debug = false
}: ScaleVideoParams): Promise<string> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ffmpeg-"));
  const tempOutPath = path.join(tempDir, `${uuidv4()}.mp4`);
  
  let inputPath;
  if (input.startsWith('data:')) {
    // Extract the base64 content and decode it to a temporary file
    const base64Content = input.split(';base64,').pop();
    if (!base64Content) {
      throw new Error('Invalid base64 input provided');
    }
    inputPath = path.join(tempDir, `${uuidv4()}.mp4`);
    await writeFile(inputPath, base64Content, 'base64');
  } else {
    inputPath = input;
  }

  if (debug) {
    console.log("inputPath:", inputPath)
  }
  
  // Return a promise that resolves with the base64 string of the output video
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-vf', `scale=-1:${height}`,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '22'
      ])
      .on('error', (err) => {
        reject(new Error(`Error scaling the video: ${err.message}`));
      })
      .on('end', async () => {
        if (!asBase64) {
          resolve(tempOutPath)
          return
        }
        // Convert the output file to a base64 string
        try {
          const videoBuffer = await readFile(tempOutPath);
          const videoBase64 = `data:video/mp4;base64,${videoBuffer.toString('base64')}`;
          resolve(videoBase64);
        } catch (error) {
          reject(new Error(`Error loading the video file: ${error}`));
        } finally {
          // Clean up temporary files
          await rm(tempDir, { recursive: true });
        }
      })
      .save(tempOutPath);
  });
}