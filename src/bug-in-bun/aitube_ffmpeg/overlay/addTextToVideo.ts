import { deleteFile } from "@aitube/io"

import { createTextOverlayImage } from "./createTextOverlayImage"
import { addImageToVideo } from "./addImageToVideo"

export async function addTextToVideo({
  inputVideoPath,
  outputVideoPath,
  text,
  width,
  height,
}: {
  inputVideoPath: string
  outputVideoPath: string
  text: string
  width: number
  height: number
}): Promise<string> {
  
  const { filePath: temporaryImageOverlayFilePath } = await createTextOverlayImage({
    text,
    textStyle: "outline", // or "highlight"
    fontSize: 4,
    horizontalPosition: "center",
    verticalPosition: "end",
    px: 1,
    py: 3,
    width,
    height,
  })

  // console.log("addTextToVideo: temporaryImageOverlayFilePath:", temporaryImageOverlayFilePath)

  await addImageToVideo({
    inputVideoPath,
    inputImagePath: temporaryImageOverlayFilePath,
    outputVideoPath,
  })

  await deleteFile(temporaryImageOverlayFilePath)

  // console.log("addTextToVideo: outputVideoPath:", outputVideoPath)
  return outputVideoPath
}