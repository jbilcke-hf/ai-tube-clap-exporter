import { tmpdir } from "node:os"
import { join } from "node:path"
import { mkdtemp } from "node:fs/promises"
import { v4 as uuidv4 } from "uuid"

import { ClapProject } from "./core/clap/types.mts";
import { concatenateAudio } from "./core/ffmpeg/concatenateAudio.mts";
import { concatenateVideosWithAudio } from "./core/ffmpeg/concatenateVideosWithAudio.mts";
import { writeBase64ToFile } from "./core/files/writeBase64ToFile.mts";
import { concatenateVideos } from "./core/ffmpeg/concatenateVideos.mts"
import { deleteFilesWithName } from "./core/files/deleteFileWithName.mts"

/**
 * Generate a .mp4 video inside a direcory (if none is provided, it will be created in /tmp)
 * 
 * @param clap 
 * @returns file path to the final .mp4
 */
export async function clapToTmpVideoFilePath(clap: ClapProject, dir = ""): Promise<string> {

  dir = dir || (await mkdtemp(join(tmpdir(), uuidv4())))

  const videoFilePaths: string[] = []
  const videoSegments = clap.segments.filter(s => s.category === "video" && s.assetUrl.startsWith("data:video/"))

  for (const segment of videoSegments) {
    videoFilePaths.push(
      await writeBase64ToFile(
        segment.assetUrl,
        join(dir, `tmp_asset_${segment.id}.mp4`)
      )
    )
  }

  const concatenatedVideosNoSound = await concatenateVideos({
    videoFilePaths,
    output: join(dir, `tmp_asset_concatenated_videos.mp4`)
  })

  const audioTracks: string[] = []

  const musicSegments = clap.segments.filter(s => s.category === "music" && s.assetUrl.startsWith("data:audio/"))
  for (const segment of musicSegments) {
    audioTracks.push(
      await writeBase64ToFile(
        segment.assetUrl,
        join(dir, `tmp_asset_${segment.id}.wav`)
      )
    )
  }

  const concatenatedAudio = await concatenateAudio({
    output: join(dir, `tmp_asset_concatenated_audio.wav`),
    audioTracks,
    crossfadeDurationInSec: 2 // 2 seconds
  })

  const finalFilePathOfVideoWithSound = await concatenateVideosWithAudio({
    output: join(dir, `final_video.mp4`),
    audioFilePath: concatenatedAudio.filepath,
    videoFilePaths: [concatenatedVideosNoSound.filepath],
    // videos are silent, so they can stay at 0
    videoTracksVolume: 0.0,
    audioTrackVolume: 1.0,
  })

  // we delete all the temporary assets
  await deleteFilesWithName(dir, `tmp_asset_`)

  return finalFilePathOfVideoWithSound
}