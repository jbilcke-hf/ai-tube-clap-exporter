import { join } from "node:path"

import { ClapProject } from "./core/clap/types.mts";
import { concatenateAudio } from "./core/ffmpeg/concatenateAudio.mts";
import { concatenateVideosWithAudio } from "./core/ffmpeg/concatenateVideosWithAudio.mts";
import { writeBase64ToFile } from "./core/files/writeBase64ToFile.mts";
import { concatenateVideos } from "./core/ffmpeg/concatenateVideos.mts"
import { deleteFilesWithName } from "./core/files/deleteFileWithName.mts"
import { getRandomDirectory } from "./core/files/getRandomDirectory.mts";
import { addTextToVideo } from "./core/ffmpeg/addTextToVideo.mts";
import { startOfSegment1IsWithinSegment2 } from "./core/utils/startOfSegment1IsWithinSegment2.mts";
import { deleteFile } from "./core/files/deleteFile.mts";
import { extractBase64 } from "./core/base64/extractBase64.mts";

/**
 * Generate a .mp4 video inside a direcory (if none is provided, it will be created in /tmp)
 * 
 * @param clap 
 * @returns file path to the final .mp4
 */
export async function clapToTmpVideoFilePath({
  clap,
  outputDir = "",
  clearTmpFilesAtEnd = false
}: {
  clap: ClapProject

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

  for (const segment of videoSegments) {

    const base64Info = extractBase64(segment.assetUrl)
 
    // we write it to the disk *unconverted* (it might be a mp4, a webm or something else)
    let videoSegmentFilePath = await writeBase64ToFile(
      segment.assetUrl,
      join(outputDir, `tmp_asset_${segment.id}.${base64Info.extension}`)
    )

    const interfaceSegments = clap.segments.filter(s =>
      s.assetUrl.startsWith("data:text/") &&
      s.category === "interface" &&
      startOfSegment1IsWithinSegment2(s, segment)
    )
    const interfaceSegment = interfaceSegments.at(0)
    if (interfaceSegment) {
      // here we are free to use mp4, since this is an internal intermediary format
      const videoSegmentWithOverlayFilePath = join(outputDir, `tmp_asset_${segment.id}_with_interface.mp4`)

      await addTextToVideo({
        inputVideoPath: videoSegmentFilePath,
        outputVideoPath: videoSegmentWithOverlayFilePath,
        text: atob(extractBase64(interfaceSegment.assetUrl).data),
        width: clap.meta.width,
        height: clap.meta.height,
      })

      // we overwrite
      await deleteFile(videoSegmentFilePath)
      videoSegmentFilePath = videoSegmentWithOverlayFilePath
    }

    const dialogueSegments = clap.segments.filter(s =>
      s.assetUrl.startsWith("data:audio/") &&
      s.category === "dialogue" &&
      startOfSegment1IsWithinSegment2(s, segment)
    )
    const dialogueSegment = dialogueSegments.at(0)
    if (dialogueSegment) {
      extractBase64(dialogueSegment.assetUrl)
      const base64Info = extractBase64(segment.assetUrl)

      const dialogueSegmentFilePath = await writeBase64ToFile(
        dialogueSegment.assetUrl,
        join(outputDir, `tmp_asset_${segment.id}_dialogue.${base64Info.extension}`)
      )
  
      const finalFilePathOfVideoWithSound = await concatenateVideosWithAudio({
        output: join(outputDir, `${segment.id}_video_with_audio.mp4`),
        audioFilePath: dialogueSegmentFilePath,
        videoFilePaths: [videoSegmentFilePath],
        // videos are silent, so they can stay at 0
        videoTracksVolume: 0.0,
        audioTrackVolume: 1.0,
      })

      // we delete the temporary dialogue file
      await deleteFile(dialogueSegmentFilePath)

      // we overwrite the video segment
      await deleteFile(videoSegmentFilePath)

      videoSegmentFilePath = finalFilePathOfVideoWithSound
    }

    videoFilePaths.push(videoSegmentFilePath)
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
    output: join(outputDir, `final_video.mp4`),
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