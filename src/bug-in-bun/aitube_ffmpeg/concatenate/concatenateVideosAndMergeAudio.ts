import { existsSync } from "node:fs"
import path from "node:path"

import { v4 as uuidv4 } from "uuid"
import ffmpeg, { FfmpegCommand } from "fluent-ffmpeg"
import { getRandomDirectory, removeTemporaryFiles, writeBase64ToFile } from "@aitube/io"
import { addBase64Header, extractBase64 } from "@aitube/encoders"

import { getMediaInfo } from "../analyze/getMediaInfo"
import { concatenateVideos } from "./concatenateVideos"

type ConcatenateVideoAndMergeAudioOptions = {
  output?: string;
  audioTracks?: string[]; // base64
  audioFilePaths?: string[]; // path
  videoTracks?: string[]; // base64
  videoFilePaths?: string[]; // path
};

export type ConcatenateVideoAndMergeAudioOutput = {
  filepath: string;
  durationInSec: number;
}

// note: the audio tracks will be fused together, as in "mixed"
// this return a path to the file
export const concatenateVideosAndMergeAudio = async ({
  output,
  audioTracks = [],
  audioFilePaths = [],
  videoTracks = [],
  videoFilePaths = []
}: ConcatenateVideoAndMergeAudioOptions): Promise<ConcatenateVideoAndMergeAudioOutput> => {

  try {
    // Prepare temporary directories
    const tempDir = await getRandomDirectory()

    let i = 0
    for (const audioTrack of audioTracks) {
      if (!audioTrack) { continue }
      const analysis = extractBase64(audioTrack)
      const audioFilePath = path.join(tempDir, `audio${++i}.${analysis.extension}`);
      await writeBase64ToFile(addBase64Header(audioTrack, analysis.extension), audioFilePath);
      audioFilePaths.push(audioFilePath);
    }
    audioFilePaths = audioFilePaths.filter((audio) => existsSync(audio))


    // Decode and concatenate base64 video tracks to temporary file
    i = 0
    for (const videoTrack of videoTracks) {
      if (!videoTrack) { continue }

      const analysis = extractBase64(videoTrack)
      const videoFilePath = path.join(tempDir, `video${++i}.${analysis.extension}`);

      await writeBase64ToFile(addBase64Header(videoTrack, analysis.extension), videoFilePath);

      videoFilePaths.push(videoFilePath);
    }
    videoFilePaths = videoFilePaths.filter((video) => existsSync(video))

    // The final output file path
    const finalOutputFilePath = output ? output : path.join(tempDir, `${uuidv4()}.mp4`);

    /*
    console.log("DEBUG:", {
      tempDir,
      audioFilePath,
      audioTrack: audioTrack.slice(0, 40),
      videoTracks: videoTracks.map(vid => vid.slice(0, 40)),
      videoFilePaths,
      finalOutputFilePath
    })
    */

    // console.log("concatenating videos (without audio)..")
    const tempFilePath = await concatenateVideos({
      videoFilePaths,
    })
    // console.log("concatenated silent shots to: ", tempFilePath)
    
    // console.log("concatenating video + audio..")

    // Add audio to the concatenated video file
    const promise = new Promise<ConcatenateVideoAndMergeAudioOutput>((resolve, reject) => {
      let cmd = ffmpeg().addInput(tempFilePath.filepath).outputOptions("-c:v copy");

      for (const audioFilePath of audioFilePaths) {
        cmd = cmd.addInput(audioFilePath);
      }
    
      if (audioFilePaths.length) {
        // Mix all audio tracks (if there are any) into a single stereo stream
        const mixFilter = audioFilePaths.map((_, index) => `[${index + 1}:a]`).join('') + `amix=inputs=${audioFilePaths.length}:duration=first[outa]`;
        cmd = cmd
          .complexFilter(mixFilter)
          .outputOptions([
            "-map", "0:v:0", // Maps the video stream from the first input (index 0) as the output video stream
            "-map", "[outa]", // Maps the labeled audio output from the complex filter (mixed audio) as the output audio stream
            "-c:a aac", // Specifies the audio codec to be AAC (Advanced Audio Coding)
            "-shortest" // Ensures the output file's duration equals the shortest input stream's duration
          ]);
      } else {
        // If there are no audio tracks, just map the video
        cmd = cmd.outputOptions(["-map", "0:v:0"]);
      }    
    
      cmd = cmd
        .on("error", reject)
        .on('end', async () => {
          try {
            const { durationInSec } = await getMediaInfo(finalOutputFilePath);
            resolve({ filepath: finalOutputFilePath, durationInSec });
          } catch (err) {
            reject(err);
          }
        })
        .saveToFile(finalOutputFilePath);
    });

    const result = await promise;
  
    return result
  } catch (error) {
    throw new Error(`Failed to assemble video: ${(error as Error).message}`);
  } finally {
    // console.log(``)
    await removeTemporaryFiles([...videoFilePaths, ...audioFilePaths])
  }
};