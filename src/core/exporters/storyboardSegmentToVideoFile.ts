import { join } from "node:path"

import { ClapProject, ClapSegment, ClapSegmentCategory, ClapSegmentFilteringMode, filterSegments } from "@aitube/clap"
import { extractBase64 } from "@aitube/encoders"
import { deleteFile, writeBase64ToFile } from "@aitube/io"
//import { addTextToVideo, concatenateVideosWithAudio, imageToVideoBase64 } from  "@aitube/ffmpeg"
import { addTextToVideo, concatenateVideosWithAudio, imageToVideoBase64 } from  "../../bug-in-bun/aitube_ffmpeg"

export async function storyboardSegmentToVideoFile({
  clap,
  segment,
  outputDir,
}: {
  clap: ClapProject
  segment: ClapSegment
  outputDir: string
}): Promise<string> {

  let storyboardSegmentVideoFilePath = join(outputDir, `tmp_asset_${segment.id}_as_video.mp4`)

  await imageToVideoBase64({
    inputImageInBase64: segment.assetUrl,
    outputFilePath: storyboardSegmentVideoFilePath,
    width: clap.meta.width,
    height: clap.meta.height,
    outputVideoDurationInMs: segment.assetDurationInMs,
    outputDir,
    clearOutputDirAtTheEnd: false, // <- must stay false or else we lose everything!
    outputVideoFormat: "mp4",
  })

  const interfaceSegments = filterSegments(
    ClapSegmentFilteringMode.BOTH,
    segment,
    clap.segments,
    ClapSegmentCategory.INTERFACE
  )

  console.log(`clapWithStoryboardsToVideoFile: got ${interfaceSegments.length} interface segments for shot ${segment.id} [${segment.startTimeInMs}:${segment.endTimeInMs}]`)

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

  const dialogueSegments = filterSegments(
    ClapSegmentFilteringMode.BOTH,
    segment,
    clap.segments,
    ClapSegmentCategory.DIALOGUE
  ).filter(s => s.assetUrl.startsWith("data:audio/"))

  console.log(`clapWithStoryboardsToVideoFile: got ${dialogueSegments.length} dialogue segments for shot ${segment.id} [${segment.startTimeInMs}:${segment.endTimeInMs}]`)
  
  const dialogueSegment = dialogueSegments.at(0)
  if (dialogueSegment) {
    console.log(`dialogueSegment: ${dialogueSegment.assetUrl.slice(0, 60)}...`)
    const base64Info = extractBase64(dialogueSegment.assetUrl)
    console.log(`dialogueSegment: format: is ${base64Info.mimetype} (.${base64Info.extension})`)
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

  return storyboardSegmentVideoFilePath
}