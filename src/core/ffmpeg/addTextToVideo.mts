import { createTextOverlayImage } from "./createTextOverlayImage.mts";
import { addImageToVideo } from "./addImageToVideo.mts";

export async function addTextToVideo() {
  
  const inputVideoPath = "/Users/jbilcke/Downloads/use_me.mp4"

  const { filePath } = await createTextOverlayImage({
    text: "This tech is hot 🥵",
    width: 1024 ,
    height: 576,
  })
  console.log("filePath:", filePath)

  /*
  const pathToVideo = await addImageToVideo({
    inputVideoPath,
    inputImagePath: filePath,
  })

  console.log("pathToVideo:", pathToVideo)
  */
}