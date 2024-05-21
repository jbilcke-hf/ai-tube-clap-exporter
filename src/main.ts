import { join } from "node:path"

import { ClapProject, ClapSegmentCategory } from "@aitube/clap"
import { deleteFilesWithName, getRandomDirectory, writeBase64ToFile } from "@aitube/io"
import {
  concatenateAudio,
  concatenateVideos,
  concatenateVideosWithAudio,
  defaultExportFormat,
  type SupportedExportFormat,
  type ConcatenateAudioOutput,
  getMediaInfo
// } from "@aitube/ffmpeg"
} from "./bug-in-bun/aitube_ffmpeg"

import { clapWithStoryboardsToVideoFile } from "./core/exporters/clapWithStoryboardsToVideoFile"
import { clapWithVideosToVideoFile } from "./core/exporters/clapWithVideosToVideoFile"
import { extractBase64 } from "@aitube/encoders"
import { videoChunksOnly } from "./core/utils/videoChunksOnly"

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
  console.log(`clapToTmpVideoFilePath()`)

  // in case we have an issue with the format
  if (format !== "mp4" && format !== "webm") {
    format = "mp4"
  }

  outputDir = outputDir || (await getRandomDirectory())

  const videoSegments = videoChunksOnly(clap)
  
  const storyboardSegments = clap.segments.filter(s => s.category === ClapSegmentCategory.STORYBOARD && s.assetUrl.startsWith("data:image/"))

  const canUseVideos = videoSegments.length > 0
  const canUseStoryboards = !canUseVideos && storyboardSegments.length > 0

  // we count the duration of the whole video
  let totalDurationInMs = 0
  clap.segments.forEach(s => {
    if (s.endTimeInMs > totalDurationInMs) {
      totalDurationInMs = s.endTimeInMs
    }
  })

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
  
  const musicFilePaths: string[] = []

  const musicSegments = clap.segments.filter(s =>
      s.category === ClapSegmentCategory.MUSIC &&
      s.assetUrl.startsWith("data:audio/")
  )

  console.log(`clapToTmpVideoFilePath: got ${musicSegments.length} music segments in total`)
  
  // note: once we start with a certain type eg. mp3, there is no going to back
  // another format like wav, we can't concatenate them together (well, not yet)
  let detectedMusicTrackFormat = ''

  // we count how much music has been generated
  // if it is not enough to fill the full video, we will loop it (using cross-fading)
  let availableMusicDurationInMs = 0

  for (const segment of musicSegments) {
    const analysis = extractBase64(segment.assetUrl)
    if (!detectedMusicTrackFormat) {
      detectedMusicTrackFormat = analysis.extension
    } else if (detectedMusicTrackFormat !== analysis.extension) {
      throw new Error(`fatal error: concatenating a mixture of ${detectedMusicTrackFormat} and ${analysis.extension} tracks isn't supported yet`)
    }

    const { durationInMs, hasAudio } = await getMediaInfo(segment.assetUrl)

    // we have to skip silent music tracks
    if (!hasAudio) {
      console.log(`skipping a silent music track`)
      continue
    }

    const newMusicFilePath = await writeBase64ToFile(
      segment.assetUrl,
      join(outputDir, `tmp_asset_${segment.id}.${analysis.extension}`)
    )

    // console.log("wrote music to " + newMusicFilePath)
    musicFilePaths.push(newMusicFilePath)

    availableMusicDurationInMs += durationInMs
  }

  let concatenatedAudio: ConcatenateAudioOutput | undefined = undefined

  if (musicFilePaths.length > 0) {
    // console.log(`clapToTmpVideoFilePath: calling concatenateAudio over ${musicFilePaths.length} audio tracks`)
    
    if (!detectedMusicTrackFormat) {
      throw new Error(`uh that's weird, we couldn't detect the audio type`)
    }

    const availableMusicFilePaths = [...musicFilePaths]

    // if we don't have enough music audio content
    while (availableMusicDurationInMs < totalDurationInMs) {
      let musicFilePathToRepeat = availableMusicFilePaths.shift()

      // abort if there are no available tracks (for some reason)
      if (!musicFilePathToRepeat) { break }

      availableMusicFilePaths.push(musicFilePathToRepeat)

      // we artificially duplicate it (note: this will be cross-faded)
      const { durationInMs } = await getMediaInfo(musicFilePathToRepeat)

      // let's abord if we have bad data
      if (!durationInMs || durationInMs < 1000) { break }
 
      musicFilePaths.push(musicFilePathToRepeat)
  
      availableMusicDurationInMs += durationInMs
    }

    /*
    console.log("DEBUG:", {
      musicFilePaths,
      availableMusicFilePaths,
      availableMusicDurationInMs
    })
    */


    concatenatedAudio = await concatenateAudio({
      output: join(outputDir, `tmp_asset_concatenated_audio.${detectedMusicTrackFormat}`),
      audioFilePaths: musicFilePaths,
      crossfadeDurationInSec: 2, // 2 seconds
      outputFormat: detectedMusicTrackFormat
    })
    // console.log(`clapToTmpVideoFilePath: concatenatedAudio = ${concatenatedAudio}`)
  }

  /*
  console.log(`calling concatenateVideosWithAudio: `, {
    output: join(outputDir, `final_video.${format}`),
    format,
    audioFilePath: concatenatedAudio ? concatenatedAudio?.filepath : undefined,
    videoFilePaths: [concatenatedVideosNoMusic.filepath],
    // videos are silent, so they can stay at 0
    videoTracksVolume: concatenatedAudio ? 0.85 : 1.0,
    audioTrackVolume: concatenatedAudio ? 0.15 : 0.0, // let's keep the music volume low
  })
  */

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
    // console.log(`clapToTmpVideoFilePath: calling deleteFilesWithName(${outputDir}, 'tmp_asset_')`)
    await deleteFilesWithName(outputDir, `tmp_asset_`)
  }

  /*
  console.log(`clapToTmpVideoFilePath: returning ${JSON.stringify( {
    tmpWorkDir: outputDir,
    outputFilePath: finalFilePathOfVideoWithMusic
  }, null, 2)}`)
  */

  return {
    tmpWorkDir: outputDir,
    outputFilePath: finalFilePathOfVideoWithMusic
  }
}