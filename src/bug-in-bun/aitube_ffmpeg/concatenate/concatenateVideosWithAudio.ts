import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { v4 as uuidv4 } from "uuid"
import ffmpeg, { FfmpegCommand } from "fluent-ffmpeg"
import { addBase64Header, extractBase64 } from "@aitube/encoders"
import { getRandomDirectory, removeTemporaryFiles, writeBase64ToFile } from "@aitube/io"

import { getMediaInfo } from "../analyze/getMediaInfo"
import { concatenateVideos } from "./concatenateVideos"

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
    const tempDir = await getRandomDirectory()

    if (audioTrack && audioTrack.length > 0) {
      const analysis = extractBase64(audioTrack)
      // console.log(`concatenateVideosWithAudio: writing down an audio file (${analysis.extension}) from the supplied base64 track`)
      audioFilePath = path.join(tempDir, `audio.${analysis.extension}`)
      
      await writeBase64ToFile(addBase64Header(audioTrack, analysis.extension), audioFilePath)
    }

    // Decode and concatenate base64 video tracks to temporary file
    let i = 0
    for (const track of videoTracks) {
      if (!track) { continue }
      // note: here we assume the input video is in mp4
      
      const analysis = extractBase64(audioTrack)
      const videoFilePath = path.join(tempDir, `video${++i}.${analysis.extension}`)

      // console.log(`concatenateVideosWithAudio: writing down a video file (${analysis.extension}) from the supplied base64 track`)

      await writeBase64ToFile(addBase64Header(track, analysis.extension), videoFilePath)

      videoFilePaths.push(videoFilePath)
    }

    videoFilePaths = videoFilePaths.filter((video) => existsSync(video))

    // console.log("concatenateVideosWithAudio: concatenating videos (without audio)..")
    const tempFilePath = await concatenateVideos({
      videoFilePaths,
    })
    // console.log(`concatenateVideosWithAudio: tempFilePath = ${JSON.stringify(tempFilePath, null, 2)}`)

    // Check if the concatenated video has audio or not
    const tempMediaInfo = await getMediaInfo(tempFilePath.filepath);
    const hasOriginalAudio = tempMediaInfo.hasAudio;

    // console.log(`concatenateVideosWithAudio: hasOriginalAudio = ${hasOriginalAudio}`)

    const finalOutputFilePath = output || path.join(tempDir, `${uuidv4()}.${format}`);

    // console.log(`concatenateVideosWithAudio: finalOutputFilePath = ${finalOutputFilePath}`)

    // Begin ffmpeg command configuration
    let ffmpegCommand = ffmpeg();

    
    ffmpegCommand = ffmpegCommand.addInput(tempFilePath.filepath);
 
    ffmpegCommand = ffmpegCommand.outputOptions('-loglevel', 'debug');

    // If additional audio is provided, add audio to ffmpeg command
    if (typeof audioFilePath === "string" && audioFilePath.length > 0) {
      // console.log(`concatenateVideosWithAudio: adding an audio file path: ${audioFilePath}`)

      ffmpegCommand = ffmpegCommand.addInput(audioFilePath);
      // If the input video already has audio, we will mix it with additional audio
      if (hasOriginalAudio) {
        // console.log(`concatenateVideosWithAudio: case 1: additional audio was provided, and we already have audio: we mix`)

        const filterComplex = `
          [0:a]volume=${videoTracksVolume}[a0];
          [1:a]volume=${audioTrackVolume}[a1];
          [a0][a1]amix=inputs=2:duration=shortest[a]
        `.trim();

        ffmpegCommand = ffmpegCommand.outputOptions([
          '-filter_complex', filterComplex,
          '-map', '0:v',
          '-map', '[a]',
          '-c:v', 'copy',
          '-c:a', 'aac',
        ]);
      } else {
        // console.log(`concatenateVideosWithAudio: case 2: additional audio was provided, but we don't already have audio: we overwrite`)

        // If the input video has no audio, just use the additional audio as is
        ffmpegCommand = ffmpegCommand.outputOptions([
          '-map', '0:v',
          '-map', '1:a',
          '-c:v', 'copy',
          '-c:a', 'aac',
        ]);
      }
    } else {
      // console.log(`concatenateVideosWithAudio: case 3: no additional audio provided, we leave the audio as-is`)

      // If no additional audio is provided, simply copy the video stream
      ffmpegCommand = ffmpegCommand.outputOptions([
        '-c:v', 'copy',
        hasOriginalAudio ? '-c:a copy' : '-an', // If original audio exists, copy it; otherwise, indicate no audio
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
      ffmpegCommand.on('start', function(commandLine) {
        console.log('concatenateVideosWithAudio: Spawned Ffmpeg with command: ' + commandLine);
      }).on('error', (err) => {
        console.error("concatenateVideosWithAudio: error during ffmpeg processing");
        console.error(err)
        reject(err);
      }).on('end', async () => {
        // When ffmpeg finishes processing, resolve the promise with file info
        try {
          if (asBase64) {
            try {
              const outputBuffer = await readFile(finalOutputFilePath);
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
    // console.log(`concatenateVideosWithAudio: deleting ${JSON.stringify([...videoFilePaths].concat(audioFilePath), null, 2)}`)
    await removeTemporaryFiles([...videoFilePaths].concat(audioFilePath))
  }
};