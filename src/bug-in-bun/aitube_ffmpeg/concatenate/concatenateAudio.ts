import { existsSync } from "node:fs"
import path from "node:path"

import { v4 as uuidv4 } from "uuid"
import ffmpeg, { FfmpegCommand } from "fluent-ffmpeg"
import { getRandomDirectory, removeTemporaryFiles, writeBase64ToFile } from "@aitube/io"
import { addBase64Header } from "@aitube/encoders"

import { getMediaInfo } from "../analyze/getMediaInfo"

export type ConcatenateAudioOptions = {
  // those are base64 audio strings!
  audioTracks?: string[]; // base64
  audioFilePaths?: string[]; // path
  crossfadeDurationInSec?: number;
  outputFormat?: string; // "wav" or "mp3"
  output?: string;
}

export type ConcatenateAudioOutput = {
  filepath: string;
  durationInSec: number;
}

export async function concatenateAudio({
  output,
  audioTracks = [],
  audioFilePaths = [],
  crossfadeDurationInSec = 10,
  outputFormat = "wav"
}: ConcatenateAudioOptions): Promise<ConcatenateAudioOutput> {
  if (!Array.isArray(audioTracks)) {
    throw new Error("Audios must be provided in an array");
  }

  const tempDir = await getRandomDirectory()

  // console.log("  |- created tmp dir")

  // trivial case: there is only one audio to concatenate!
  if (audioTracks.length === 1 && audioTracks[0]) {
    const audioTrack = audioTracks[0]
    const outputFilePath = path.join(tempDir, `audio_0.${outputFormat}`)
    await writeBase64ToFile(addBase64Header(audioTrack, "wav"), outputFilePath)

    // console.log("  |- there is only one track! so.. returning that")
    const { durationInSec } = await getMediaInfo(outputFilePath)
    return { filepath: outputFilePath, durationInSec }
  }

  if (audioFilePaths.length === 1) {
    throw new Error("concatenating a single audio file path is not implemented yet")
  }
  
  try {

    let i = 0
    for (const track of audioTracks) {
      if (!track) { continue }
      const audioFilePath = path.join(tempDir, `audio_${++i}.wav`);
      await writeBase64ToFile(addBase64Header(track, "wav"), audioFilePath)
      
      audioFilePaths.push(audioFilePath);
    }

    // TODO: convert this to an async filter using promises
    audioFilePaths = audioFilePaths.filter((audio) => existsSync(audio))

    const outputFilePath = output ?? path.join(tempDir, `${uuidv4()}.${outputFormat}`);
  
    let filterComplex = "";
    let prevLabel = "0";

    for (let i = 0; i < audioFilePaths.length - 1; i++) {
      const nextLabel = `a${i}`;
      filterComplex += `[${prevLabel}][${i + 1}]acrossfade=d=${crossfadeDurationInSec}:c1=tri:c2=tri[${nextLabel}];`;
      prevLabel = nextLabel;
    }

    /*
    console.log("  |- concatenateAudio(): DEBUG:", {
      tempDir,
      audioFilePaths,
      outputFilePath,
      filterComplex,
      prevLabel
    })
    */

    let cmd: FfmpegCommand = ffmpeg() // .outputOptions('-vn');

    audioFilePaths.forEach((audio, i) => {
      cmd = cmd.input(audio)
    })

    const promise = new Promise<ConcatenateAudioOutput>((resolve, reject) => {
      cmd = cmd
        .on('error', reject)
        .on('end', async () => {
          try {
            const { durationInSec } = await getMediaInfo(outputFilePath);
            
            // console.log("concatenation ended! see ->", outputFilePath)
            resolve({ filepath: outputFilePath, durationInSec })

          } catch (err) {
            reject(err)
          }
        })
        .complexFilter(filterComplex, prevLabel)
        .save(outputFilePath);
    });

    const result = await promise

    return result
  } catch (error) {
    console.error(`Failed to assemble audio!`)
    console.error(error)
    throw new Error(`Failed to assemble audio: ${(error as Error)?.message || error}`);
  } finally {
    await removeTemporaryFiles(audioFilePaths)
  }
}
