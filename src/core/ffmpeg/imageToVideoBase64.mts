import { rm, mkdir, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";
import { getRandomDirectory } from "../files/getRandomDirectory.mts";

/**
 * Converts an image in Base64 format to a video encoded in Base64.
 * 
 * @param inputImageInBase64 - The input image encoded in Base64.
 * @param outputVideoFormat - Optional. Format of the output video (default is "mp4").
 * @param outputVideoDurationInMs - Optional. Duration of the video in milliseconds (default is 1000ms).
 * @param codec - Optional. Codec used for video coding. Defaults differ based on `outputVideoFormat`.
 * @param width - Optional. Width of the output video.
 * @param height - Optional. Height of the output video.
 * @param fps - Optional. Frame rate of the output video.
 * 
 * @returns - A promise that resolves to the video as a Base64 encoded string.
 */
export async function imageToVideoBase64({
  inputImageInBase64,
  outputFilePath,
  outputDir,
  clearOutputDirAtTheEnd = true,
  outputVideoFormat = "mp4",
  outputVideoDurationInMs = 1000,
  codec = outputVideoFormat === "webm" ? "libvpx-vp9" : "libx264",
  width = 1920,
  height = 1080,
  fps = 25
}: {
  inputImageInBase64: string
  outputFilePath?: string
  outputDir?: string
  clearOutputDirAtTheEnd?: boolean
  outputVideoFormat?: string
  outputVideoDurationInMs?: number
  codec?: string
  width?: number
  height?: number
  fps?: number
}): Promise<string> {

  outputDir = outputDir || (await getRandomDirectory())

  console.log(`imagetoVideoBase64 called with: ${JSON.stringify({
    inputImageInBase64: inputImageInBase64?.slice(0, 50),
    outputFilePath,
    width,
    height,
    outputVideoDurationInMs,
    outputDir,
    clearOutputDirAtTheEnd,
    outputVideoFormat,
  }, null, 2)}`)

  // Decode the Base64 image and write it to a temporary file.
  const base64Data = inputImageInBase64.substring(inputImageInBase64.indexOf(',') + 1);
  const buffer = Buffer.from(base64Data, 'base64');
  const inputImagePath = path.join(outputDir, 'inputImage.png');
  await writeFile(inputImagePath, buffer);

  // Set the path for the output video.
  outputFilePath = outputFilePath || path.join(outputDir, `output.${outputVideoFormat}`);
  const durationInSeconds = outputVideoDurationInMs / 1000;

  console.log("durationInSeconds: " + durationInSeconds)

  // Process the image to video conversion using ffmpeg.
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputImagePath)
      .inputOptions(['-loop 1'])  // Loop the input image
      .outputOptions([
        `-t ${durationInSeconds}`,
        `-r ${fps}`,
        `-s ${width}x${height}`, // set frame size
        `-c:v ${codec}`, // set the codec
        '-tune stillimage',
        '-pix_fmt yuv420p'
      ])
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .save(outputFilePath);
  });

  // Read the video file, encode it to Base64, and format it as a data URI.
  const videoBuffer = await readFile(outputFilePath);
  const videoBase64 = videoBuffer.toString('base64');
  const resultAsBase64DataUri = `data:video/${outputVideoFormat};base64,${videoBase64}`;

  // Attempt to clean up temporary work files.
  if (clearOutputDirAtTheEnd) {
    try {
      await rm(outputDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Error removing temporary files:', error);
    }
  }
  
  return resultAsBase64DataUri;
}