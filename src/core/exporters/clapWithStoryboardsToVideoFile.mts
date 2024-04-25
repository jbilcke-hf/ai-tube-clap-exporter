import { join } from "node:path"

import { ClapProject } from "../clap/types.mts"
import { concatenateVideosWithAudio } from "../ffmpeg/concatenateVideosWithAudio.mts"
import { writeBase64ToFile } from "../files/writeBase64ToFile.mts"
import { getRandomDirectory } from "../files/getRandomDirectory.mts"
import { addTextToVideo } from "../ffmpeg/addTextToVideo.mts"
import { startOfSegment1IsWithinSegment2 } from "../utils/startOfSegment1IsWithinSegment2.mts"
import { deleteFile } from "../files/deleteFile.mts"
import { extractBase64 } from "../base64/extractBase64.mts"
import { ClapSegment } from "../clap/types.mts"
import { imageToVideoBase64 } from "../ffmpeg/imageToVideoBase64.mts"

export async function clapWithStoryboardsToVideoFile({
  clap,
  storyboardSegments = [],
  outputDir = "",
}: {
  clap: ClapProject
  storyboardSegments: ClapSegment[]
  outputDir?: string
}): Promise<{
  outputDir: string
  videoFilePaths: string[]
}> {

  outputDir = outputDir || (await getRandomDirectory())

  const videoFilePaths: string[] = []

  for (const segment of storyboardSegments) {

    let storyboardSegmentVideoFilePath = join(outputDir, `tmp_asset_${segment.id}_as_video.mp4`)

    await imageToVideoBase64({
      inputImageInBase64: segment.assetUrl,
      outputFilePath: storyboardSegmentVideoFilePath,
      outputDir,
      clearOutputDirAtTheEnd: false, // <- must stay false or else we lose everything!
      outputVideoFormat: "mp4",
    })

    const interfaceSegments = clap.segments.filter(s =>
      // nope, not all interfaces asset have the assetUrl
      // although in the future.. we might want to
      // s.assetUrl.startsWith("data:text/") &&
      s.category === "interface" &&
      startOfSegment1IsWithinSegment2(s, segment)
    )
    const interfaceSegment = interfaceSegments.at(0)
    if (interfaceSegment) {
      // here we are free to use mp4, since this is an internal intermediary format
      const videoSegmentWithOverlayFilePath = join(outputDir, `tmp_asset_${segment.id}_with_interface.mp4`)

      await addTextToVideo({
        inputVideoPath: storyboardSegmentVideoFilePath,
        outputVideoPath: videoSegmentWithOverlayFilePath,
        text: interfaceSegment.assetUrl.startsWith("data:text/")
          ? atob(extractBase64(interfaceSegment.assetUrl).data)
          : interfaceSegment.assetUrl,
        width: clap.meta.width,
        height: clap.meta.height,
      })

      // we overwrite
      await deleteFile(storyboardSegmentVideoFilePath)
      storyboardSegmentVideoFilePath = videoSegmentWithOverlayFilePath
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
        videoFilePaths: [storyboardSegmentVideoFilePath],
        // videos are silent, so they can stay at 0
        videoTracksVolume: 0.0,
        audioTrackVolume: 1.0,
      })

      // we delete the temporary dialogue file
      await deleteFile(dialogueSegmentFilePath)

      // we overwrite the video segment
      await deleteFile(storyboardSegmentVideoFilePath)

      storyboardSegmentVideoFilePath = finalFilePathOfVideoWithSound
    }

    videoFilePaths.push(storyboardSegmentVideoFilePath)
  }

  return {
    outputDir,
    videoFilePaths,
  }
}