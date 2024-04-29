import { ClapProject, ClapSegment } from "@aitube/clap"

import { getRandomDirectory } from "../files/getRandomDirectory.mts"
import { videoSegmentToVideoFile } from "./videoSegmentToVideoFile.mts"


export async function clapWithVideosToVideoFile({
  clap,
  videoSegments = [],
  outputDir = "",
}: {
  clap: ClapProject
  videoSegments: ClapSegment[]
  outputDir?: string
}): Promise<{
  outputDir: string
  videoFilePaths: string[]
}> {

  outputDir = outputDir || (await getRandomDirectory())

  const videoFilePaths: string[] = await Promise.all(videoSegments.map(segment =>
    videoSegmentToVideoFile({
      clap,
      segment,
      outputDir,
    })
  ))

  console.log(`clapWithVideosToVideoFile: videoFilePaths: ${JSON.stringify(videoFilePaths, null, 2)}`)
  
  return {
    outputDir,
    videoFilePaths,
  }
}