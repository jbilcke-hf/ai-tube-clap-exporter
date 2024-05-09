import { join } from "node:path"

import { ClapProject, ClapSegment, ClapSegmentCategory, ClapSegmentFilteringMode, filterSegments } from "@aitube/clap"
import { extractBase64 } from "@aitube/encoders"
import { deleteFile, writeBase64ToFile } from "@aitube/io"
// import { addTextToVideo, concatenateVideosWithAudio } from "@aitube/ffmpeg"
import { addTextToVideo, concatenateVideosWithAudio, scaleVideo } from "../../bug-in-bun/aitube_ffmpeg"

export async function videoSegmentToVideoFile({
  clap,
  segment,
  outputDir,
}: {
  clap: ClapProject
  segment: ClapSegment
  outputDir: string
}): Promise<string> {

  const base64Info = extractBase64(segment.assetUrl)

  // we write it to the disk *unconverted* (it might be a mp4, a webm or something else)
  let videoSegmentFilePath = await writeBase64ToFile(
    segment.assetUrl,
    join(outputDir, `tmp_asset_${segment.id}.${base64Info.extension}`)
  )
  const interfaceSegments = filterSegments(
    ClapSegmentFilteringMode.BOTH,
    segment,
    clap.segments,
    ClapSegmentCategory.INTERFACE
  )
  
  console.log(`clapWithVideoToVideoFile: got ${interfaceSegments.length} interface segments for shot ${segment.id} [${segment.startTimeInMs}:${segment.endTimeInMs}]`)

  const interfaceSegment = interfaceSegments.at(0)
  if (interfaceSegment) {
    // here we are free to use mp4, since this is an internal intermediary format
    const videoSegmentWithOverlayFilePath = join(outputDir, `tmp_asset_${segment.id}_with_interface.mp4`)
    
    await addTextToVideo({
      inputVideoPath: videoSegmentFilePath,
      outputVideoPath: videoSegmentWithOverlayFilePath,
      text: interfaceSegment.assetUrl.startsWith("data:text/")
        ? atob(extractBase64(interfaceSegment.assetUrl).data)
        : interfaceSegment.assetUrl,
      width: clap.meta.width,
      height: clap.meta.height,
    })
    // we overwrite
    await deleteFile(videoSegmentFilePath)
    videoSegmentFilePath = videoSegmentWithOverlayFilePath
  }

  const dialogueSegments = filterSegments(
    ClapSegmentFilteringMode.BOTH,
    segment,
    clap.segments,
    ClapSegmentCategory.DIALOGUE
  ).filter(s => s.assetUrl.startsWith("data:audio/"))

  const dialogueSegment = dialogueSegments.at(0)
  if (dialogueSegment) {
    extractBase64(dialogueSegment.assetUrl)
    const base64Info = extractBase64(dialogueSegment.assetUrl)
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

  return videoSegmentFilePath
}