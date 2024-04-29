import { ClapProject, ClapSegment } from "@aitube/clap"

import { getRandomDirectory } from "../files/getRandomDirectory.mts"
import { storyboardSegmentToVideoFile } from "./storyboardSegmentToVideoFile.mts"

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

  const videoFilePaths: string[] = await Promise.all(storyboardSegments.map(segment =>
    storyboardSegmentToVideoFile({
      clap,
      segment,
      outputDir,
    })
  ))

  // console.log(`clapWithStoryboardsToVideoFile: videoFilePaths: ${JSON.stringify(videoFilePaths, null, 2)}`)
    
  return {
    outputDir,
    videoFilePaths,
  }
}