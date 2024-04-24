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
    const tempDir = path.join(os.tmpdir(), uuidv4());
    await fs.mkdir(tempDir);

    let i = 0
    for (const track of audioTracks) {
      if (!track) { continue }
      const audioFilePath = path.join(tempDir, `audio${++i}.wav`);
      await writeBase64ToFile(addBase64Header(track, "wav"), audioFilePath);
      audioFilePaths.push(audioFilePath);
    }
    audioFilePaths = audioFilePaths.filter((audio) => existsSync(audio))


    // Decode and concatenate base64 video tracks to temporary file
    i = 0
    for (const track of videoTracks) {
      if (!track) { continue }
      const videoFilePath = path.join(tempDir, `video${++i}.mp4`);

      await writeBase64ToFile(addBase64Header(track, "mp4"), videoFilePath);

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
    await removeTemporaryFiles([...videoFilePaths, ...audioFilePaths])
  }
};