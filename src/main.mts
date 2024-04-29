import { join } from "node:path"

import { ClapProject } from "@aitube/clap";

import { concatenateAudio, ConcatenateAudioOutput } from "./core/ffmpeg/concatenateAudio.mts";
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

  // in case we have an issue with the format
  if (format !== "mp4" && format !== "webm") {
    format = "mp4"
  }

  outputDir = outputDir || (await getRandomDirectory())

  const videoSegments = clap.segments.filter(s => s.category === "video" && s.assetUrl.startsWith("data:video/"))
  const storyboardSegments = clap.segments.filter(s => s.category === "storyboard" && s.assetUrl.startsWith("data:image/"))

  const canUseVideos = videoSegments.length > 0
  const canUseStoryboards = !canUseVideos && storyboardSegments.length > 0

  let videoFilePaths: string[] = []

  // two possibilities:
  // we can either generate from the video files, or from the storyboards
  // the storyboard video will be a bit more boring, but at least it should process faster
  if (canUseVideos) {
    const concatenatedData = await clapWithVideosToVideoFile({
      clap,
      videoSegments,
      outputDir,
    })

    // console.log(`clapToTmpVideoFilePath: called clapWithVideosToVideoFile, got concatenatedData = ${JSON.stringify(concatenatedData, null, 2)}`)
  
    videoFilePaths = concatenatedData.videoFilePaths
  } else if (canUseStoryboards) {
    const concatenatedData = await clapWithStoryboardsToVideoFile({
      clap,
      storyboardSegments,
      outputDir,
    })

    // console.log(`clapToTmpVideoFilePath: called clapWithStoryboardsToVideoFile, got concatenatedData = ${JSON.stringify(concatenatedData, null, 2)}`)
  
    videoFilePaths = concatenatedData.videoFilePaths
  } else {
    throw new Error(`the provided Clap doesn't contain any video or storyboard`)
  }

  console.log(`clapToTmpVideoFilePath: calling concatenateVideos over ${videoFilePaths.length} video chunks: ${JSON.stringify(videoFilePaths, null, 2)}\nconcatenateVideos(${JSON.stringify({
    videoFilePaths,
    output: join(outputDir, `tmp_asset_concatenated_videos.mp4`)
  }, null, 2)})`)
  
  const concatenatedVideosNoMusic = await concatenateVideos({
    videoFilePaths,
    output: join(outputDir, `tmp_asset_concatenated_videos.mp4`)
  })

  console.log(`clapToTmpVideoFilePath: concatenatedVideosNoMusic`, concatenatedVideosNoMusic)
  
  const audioTracks: string[] = []

  const musicSegments = clap.segments.filter(s =>
      s.category === "music" &&
      s.assetUrl.startsWith("data:audio/")
  )

  console.log(`clapToTmpVideoFilePath: got ${musicSegments.length} music segments in total`)
  
  for (const segment of musicSegments) {
    audioTracks.push(
      await writeBase64ToFile(
        segment.assetUrl,
        join(outputDir, `tmp_asset_${segment.id}.wav`)
      )
    )
  }

  let concatenatedAudio: ConcatenateAudioOutput | undefined = undefined

  if (audioTracks.length > 0) {
    console.log(`clapToTmpVideoFilePath: calling concatenateAudio over ${audioTracks.length} audio tracks`)
    
    concatenatedAudio = await concatenateAudio({
      output: join(outputDir, `tmp_asset_concatenated_audio.wav`),
      audioTracks,
      crossfadeDurationInSec: 2 // 2 seconds
    })
    console.log(`clapToTmpVideoFilePath: concatenatedAudio = ${concatenatedAudio}`)
  }

  console.log(`calling concatenateVideosWithAudio: `, {
    output: join(outputDir, `final_video.${format}`),
    format,
    audioFilePath: concatenatedAudio ? concatenatedAudio?.filepath : undefined,
    videoFilePaths: [concatenatedVideosNoMusic.filepath],
    // videos are silent, so they can stay at 0
    videoTracksVolume: concatenatedAudio ? 0.85 : 1.0,
    audioTrackVolume: concatenatedAudio ? 0.15 : 0.0, // let's keep the music volume low
  })

  const finalFilePathOfVideoWithMusic = await concatenateVideosWithAudio({
    output: join(outputDir, `final_video.${format}`),
    format,
    audioFilePath: concatenatedAudio ? concatenatedAudio?.filepath : undefined,
    videoFilePaths: [concatenatedVideosNoMusic.filepath],
    // videos are silent, so they can stay at 0
    videoTracksVolume: concatenatedAudio ? 0.85 : 1.0,
    audioTrackVolume: concatenatedAudio ? 0.15 : 0.0, // let's keep the music volume low
  })
  
  console.log(`clapToTmpVideoFilePath: finalFilePathOfVideoWithMusic = ${finalFilePathOfVideoWithMusic}`)
  
  if (clearTmpFilesAtEnd) {
    // we delete all the temporary assets
    await deleteFilesWithName(outputDir, `tmp_asset_`)
  }

  console.log(`clapToTmpVideoFilePath: returning ${JSON.stringify( {
    tmpWorkDir: outputDir,
    outputFilePath: finalFilePathOfVideoWithMusic
  }, null, 2)}`)

  return {
    tmpWorkDir: outputDir,
    outputFilePath: finalFilePathOfVideoWithMusic
  }
}