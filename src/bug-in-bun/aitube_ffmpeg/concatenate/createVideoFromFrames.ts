import { access, rm, mkdir, writeFile, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import ffmpeg from "fluent-ffmpeg"
import { v4 as uuidv4 } from "uuid"

import { getMediaInfo } from "../analyze/getMediaInfo"

export async function createVideoFromFrames({
  inputFramesDirectory,
  framesFilePattern,
  outputVideoPath,
  framesPerSecond = 25,

  // there isn't a lot of advantage for us to add film grain because:
  // 1. I actually can't tell the different, probably because it's in HD, and so tiny
  // 2. We want a neat "4K video from the 2020" look, not a quality from 30 years ago
  // 3. grain has too much entropy and cannot be compressed, so it multiplies by 5 the size weight
  grainAmount = 0, // Optional parameter for film grain (eg. 10)

  inputVideoToUseAsAudio = "", // Optional parameter for audio input (need to be a mp4, but it can be a base64 data URI or a file path)

  debug = false,

  asBase64 = false,
}: {
  inputFramesDirectory: string;

  // the ffmpeg file pattern to use
  framesFilePattern?: string;

  outputVideoPath?: string;
  framesPerSecond?: number;
  grainAmount?: number; // Values can range between 0 and higher for the desired amount
  inputVideoToUseAsAudio?: string; //  Optional parameter for audio input (need to be a mp4, but it can be a base64 data URI or a file path)
  debug?: boolean;
  asBase64?: boolean;
}): Promise<string> {
  // Ensure the input directory exists
  await access(inputFramesDirectory);


  // Construct the input frame pattern
  const inputFramePattern = path.join(inputFramesDirectory, framesFilePattern || "");


  // Create a temporary working directory
  const tempDir = path.join(os.tmpdir(), uuidv4());
  await mkdir(tempDir);

   
  let inputVideoToUseAsAudioFilePath = "";
  if (inputVideoToUseAsAudio.startsWith('data:')) {
    // Extract the base64 content and decode it to a temporary file
    const base64Content = inputVideoToUseAsAudio.split(';base64,').pop();
    if (!base64Content) {
      throw new Error('Invalid base64 input provided');
    }
    inputVideoToUseAsAudioFilePath = path.join(tempDir, `${uuidv4()}_audio_input.mp4`);
    await writeFile(inputVideoToUseAsAudioFilePath, base64Content, 'base64');
  } else {
    inputVideoToUseAsAudioFilePath = inputVideoToUseAsAudio;
  }

  if (debug) {
    console.log("      createVideoFromFrames(): inputVideoToUseAsAudioFilePath = ", inputVideoToUseAsAudioFilePath)
  }


  let canUseInputVideoForAudio = false
  // Also, if provided, check that the audio source file exists
  if (inputVideoToUseAsAudioFilePath) {
    try {
      await access(inputVideoToUseAsAudioFilePath)
      const info = await getMediaInfo(inputVideoToUseAsAudioFilePath)
      if (info.hasAudio) {
        canUseInputVideoForAudio = true
      }
    } catch (err) {
      if (debug) {
        console.log("      createVideoFromFrames(): warning: input video has no audio, so we are not gonna use that")
      }
    }
  }

  const outputVideoFilePath = outputVideoPath ?? path.join(tempDir, `${uuidv4()}.mp4`);

  if (debug) {
    console.log("      createVideoFromFrames(): outputOptions:", [
      // by default ffmpeg doesn't tell us why it fails to convet
      // so we need to force it to spit everything out
      "-loglevel", "debug",

      "-pix_fmt", "yuv420p",
      "-c:v", "libx264",
      "-r", `${framesPerSecond}`,

      // from ffmpeg doc: "Consider 17 or 18 to be visually lossless or nearly so; 
      // it should look the same or nearly the same as the input."
      "-crf", "17",
    ])
  }

  return new Promise<string>((resolve, reject) => {
    const command = ffmpeg()
      .input(inputFramePattern)
      .inputFPS(framesPerSecond)
      .outputOptions([
        // by default ffmpeg doesn't tell us why it fails to convert
        // so we need to force it to spit everything out
        "-loglevel", "debug",

        "-pix_fmt", "yuv420p",
        "-c:v", "libx264",
        "-r", `${framesPerSecond}`,
        "-crf", "18",
      ]);

    
    // If an input video for audio is provided, add it as an input for the ffmpeg command
    if (canUseInputVideoForAudio) {
      if (debug) {
       console.log("      createVideoFromFrames(): adding audio as input:", inputVideoToUseAsAudioFilePath)
      }
      command.addInput(inputVideoToUseAsAudioFilePath);
      command.outputOptions([
        "-map", "0:v", // Map video from the frames
        "-map", "1:a", // Map audio from the input video
        "-shortest"    // Ensure output video duration is the shortest of the combined inputs
      ]);
    }

    // Apply grain effect using the geq filter if grainAmount is specified
    if (grainAmount != null && grainAmount > 0) {
      if (debug) {
        console.log("      createVideoFromFrames(): adding grain:", grainAmount)
      }
      command.complexFilter([
        {
          filter: "geq",
          options: `lum='lum(X,Y)':cr='cr(X,Y)+(random(1)-0.5)*${grainAmount}':cb='cb(X,Y)+(random(1)-0.5)*${grainAmount}'`
        }
      ]);
    }

    command.save(outputVideoFilePath)
      .on("error", (err) => reject(err))
      .on("end", async () => {
        if (debug) {
          console.log("      createVideoFromFrames(): outputVideoFilePath: ", outputVideoFilePath)
        }
        if (!asBase64) {
          resolve(outputVideoFilePath)
          return
        }
        // Convert the output file to a base64 string
        try {
          const videoBuffer = await readFile(outputVideoFilePath);
          const videoBase64 = `data:video/mp4;base64,${videoBuffer.toString('base64')}`;
          console.log("      createVideoFromFrames(): output base64: ", videoBase64.slice(0, 120))
          resolve(videoBase64);
        } catch (error) {
          reject(new Error(`Error loading the video file: ${error}`));
        } finally {
          // Clean up temporary files
          await rm(tempDir, { recursive: true });
        }
      });
  });
}

