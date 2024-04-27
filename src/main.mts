import { join } from "node:path"

import { ClapProject } from "@aitube/clap";

import { concatenateAudio } from "./core/ffmpeg/concatenateAudio.mts";
import { concatenateVideosWithAudio, defaultExportFormat, SupportedExportFormat } from "./core/ffmpeg/concatenateVideosWithAudio.mts";
import { writeBase64ToFile } from "./core/files/writeBase64ToFile.mts";
import { concatenateVideos } from "./core/ffmpeg/concatenateVideos.mts"
import { deleteFilesWithName } from "./core/files/deleteFileWithName.mts"
import { getRandomDirectory } from "./core/files/getRandomDirectory.mts";
import { clapWithVideosToVideoFile } from "./core/exporters/clapWithVideosToVideoFile.mts";
import { clapWithStoryboardsToVideoFile } from "./core/exporters/clapWithStoryboardsToVideoFile.mts";


/**
 * Generate a .mp4 video inside a directory (if none is provided, it will be created in /tmp)
 * 
 * @param clap 
 * @returns file path to the final .mp4
 */
export async function clapToTmpVideoFilePath({
  clap,
  format = defaultExportFormat,
  outputDir = "",
  clearTmpFilesAtEnd = false
}: {
  clap: ClapProject

  format?: SupportedExportFormat
  outputDir?: string

  // if you leave this to false, you will have to clear files yourself
  // (eg. after sending the final video file over)
  clearTmpFilesAtEnd?: boolean
}): Promise<{
  tmpWorkDir: string
  outputFilePath: string
}> {

  outputDir = outputDir || (await getRandomDirectory())

  const videoFilePaths: string[] = []

  const videoSegments = clap.segments.filter(s => s.category === "video" && s.assetUrl.startsWith("data:video/"))
  const storyboardSegments = clap.segments.filter(s => s.category === "storyboard" && s.assetUrl.startsWith("data:image/"))

  const canUseVideos = videoSegments.length > 0
  const canUseStoryboards = !canUseVideos && storyboardSegments.length > 0

  // two possibilities:
  // we can either generate from the video files, or from the storyboards
  // the storyboard video will be a bit more boring, but at least it should process faster
  if (canUseVideos) {
    await clapWithVideosToVideoFile({
      clap,
      videoSegments,
      outputDir,
    })
  } else if (canUseStoryboards) {
    await clapWithStoryboardsToVideoFile({
      clap,
      storyboardSegments,
      outputDir,
    })
  } else {
    throw new Error(`the provided Clap doesn't contain any video or storyboard`)
  }

  const concatenatedVideosNoMusic = await concatenateVideos({
    videoFilePaths,
    output: join(outputDir, `tmp_asset_concatenated_videos.mp4`)
  })

  const audioTracks: string[] = []

  const musicSegments = clap.segments.filter(s =>
      s.category === "music" &&
      s.assetUrl.startsWith("data:audio/")
  )
  for (const segment of musicSegments) {
    audioTracks.push(
      await writeBase64ToFile(
        segment.assetUrl,
        join(outputDir, `tmp_asset_${segment.id}.wav`)
      )
    )
  }

  const concatenatedAudio = await concatenateAudio({
    output: join(outputDir, `tmp_asset_concatenated_audio.wav`),
    audioTracks,
    crossfadeDurationInSec: 2 // 2 seconds
  })

  const finalFilePathOfVideoWithMusic = await concatenateVideosWithAudio({
    output: join(outputDir, `final_video.${format}`),
    format,
    audioFilePath: concatenatedAudio.filepath,
    videoFilePaths: [concatenatedVideosNoMusic.filepath],
    // videos are silent, so they can stay at 0
    videoTracksVolume: 0.85,
    audioTrackVolume: 0.15, // let's keep the music volume low
  })

  if (clearTmpFilesAtEnd) {
    // we delete all the temporary assets
    await deleteFilesWithName(outputDir, `tmp_asset_`)
  }

  return {
    tmpWorkDir: outputDir,
    outputFilePath: finalFilePathOfVideoWithMusic
  }
}