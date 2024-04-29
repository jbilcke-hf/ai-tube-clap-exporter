import { existsSync, promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

import { v4 as uuidv4 } from "uuid";
import ffmpeg, { FfmpegCommand } from "fluent-ffmpeg";
import { concatenateVideos } from "./concatenateVideos.mts";
import { writeBase64ToFile } from "../files/writeBase64ToFile.mts";
import { getMediaInfo } from "./getMediaInfo.mts";
import { removeTemporaryFiles } from "../files/removeTmpFiles.mts";
import { addBase64Header } from "../base64/addBase64.mts";

export type SupportedExportFormat = "mp4" | "webm"
export const defaultExportFormat = "mp4"

export type ConcatenateVideoWithAudioOptions = {
  output?: string;
  format?: SupportedExportFormat;
  audioTrack?: string; // base64
  audioFilePath?: string; // path
  videoTracks?: string[]; // base64
  videoFilePaths?: string[]; // path
  videoTracksVolume?: number; // Represents the volume level of the original video track
  audioTrackVolume?: number; // Represents the volume level of the additional audio track
  asBase64?: boolean;
};


export const concatenateVideosWithAudio = async ({
  output,
  format = defaultExportFormat,
  audioTrack = "",
  audioFilePath = "",
  videoTracks = [],
  videoFilePaths = [],
  videoTracksVolume = 0.5, // (1.0 = 100% volume)
  audioTrackVolume = 0.5,
  asBase64 = false,
}: ConcatenateVideoWithAudioOptions): Promise<string> => {

  try {
    // Prepare temporary directories
    const tempDir = path.join(os.tmpdir(), uuidv4());
    await fs.mkdir(tempDir);

    if (audioTrack) {
      audioFilePath = path.join(tempDir, `audio.wav`);
      await writeBase64ToFile(addBase64Header(audioTrack, "wav"), audioFilePath);
    }

    // Decode and concatenate base64 video tracks to temporary file
    let i = 0
    for (const track of videoTracks) {
      if (!track) { continue }
      const videoFilePath = path.join(tempDir, `video${++i}.mp4`);

      await writeBase64ToFile(addBase64Header(track, "mp4"), videoFilePath);

      videoFilePaths.push(videoFilePath);
    }

    videoFilePaths = videoFilePaths.filter((video) => existsSync(video))

    console.log("concatenateVideosWithAudio: concatenating videos (without audio)..")
    const tempFilePath = await concatenateVideos({
      videoFilePaths,
    })

    // Check if the concatenated video has audio or not
    const tempMediaInfo = await getMediaInfo(tempFilePath.filepath);
    const hasOriginalAudio = tempMediaInfo.hasAudio;

    const finalOutputFilePath = output || path.join(tempDir, `${uuidv4()}.${format}`);

    console.log(`concatenateVideosWithAudio: finalOutputFilePath = ${finalOutputFilePath}`)

    // Begin ffmpeg command configuration
    let cmd = ffmpeg();

    // Add silent concatenated video
    cmd = cmd.addInput(tempFilePath.filepath);
 
    // If additional audio is provided, add audio to ffmpeg command
    if (audioFilePath) {
      cmd = cmd.addInput(audioFilePath);
      // If the input video already has audio, we will mix it with additional audio
      if (hasOriginalAudio) {
        const filterComplex = `
          [0:a]volume=${videoTracksVolume}[a0];
          [1:a]volume=${audioTrackVolume}[a1];
          [a0][a1]amix=inputs=2:duration=shortest[a]
        `.trim();

        cmd = cmd.outputOptions([
          '-filter_complex', filterComplex,
          '-map', '0:v',
          '-map', '[a]',
          '-c:v', 'copy',
          '-c:a', 'aac',
        ]);
      } else {
        // If the input video has no audio, just use the additional audio as is
        cmd = cmd.outputOptions([
          '-map', '0:v',
          '-map', '1:a',
          '-c:v', 'copy',
          '-c:a', 'aac',
        ]);
      }
    } else {
      // If no additional audio is provided, simply copy the video stream
      cmd = cmd.outputOptions([
        '-c:v', 'copy',
        hasOriginalAudio ? '-c:a' : '-an', // If original audio exists, copy it; otherwise, indicate no audio
      ]);
    }


    console.log("concatenateVideosWithAudio: DEBUG:", {
      videoTracksVolume,
      audioTrackVolume,
      videoFilePaths,
      tempFilePath,
      hasOriginalAudio,
      // originalAudioVolume,
      audioFilePath,
      // additionalAudioVolume,
      finalOutputFilePath
     })

  
    // Set up event handlers for ffmpeg processing
    const promise = new Promise<string>((resolve, reject) => {
      cmd.on('error', (err) => {
        console.error("concatenateVideosWithAudio:    Error during ffmpeg processing:", err.message);
        reject(err);
      }).on('end', async () => {
        // When ffmpeg finishes processing, resolve the promise with file info
        try {
          if (asBase64) {
            try {
              const outputBuffer = await fs.readFile(finalOutputFilePath);
              const outputBase64 = addBase64Header(outputBuffer.toString("base64"), format)
              resolve(outputBase64);
            } catch (error) {
              reject(new Error(`Error reading output video file: ${(error as Error).message}`));
            }
          } else {
            resolve(finalOutputFilePath)
          }
        } catch (err) {
          reject(err);
        }
      }).save(finalOutputFilePath); // Provide the path where to save the file
    });

    // Wait for ffmpeg to complete the process
    const result = await promise;
    return result;
  } catch (error) {
    throw new Error(`Failed to assemble video: ${(error as Error).message}`);
  } finally {
    await removeTemporaryFiles([...videoFilePaths].concat(audioFilePath))
  }
};