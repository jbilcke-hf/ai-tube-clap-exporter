import { rm, writeFile, readFile } from "node:fs/promises"
import path from "node:path"

import { v4 as uuidv4 } from "uuid"
import ffmpeg from "fluent-ffmpeg"
import { getRandomDirectory } from "@aitube/io"

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
 * @param zoomInRatePerSecond - Optional. Zoom-in rate (by default 0.6, or which would zoom by 3% over 5 seconds)
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
  fps = 25,
  zoomInRatePerSecond = 0.02
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
  zoomInRatePerSecond?: number
}): Promise<string> {

  outputDir = outputDir || (await getRandomDirectory())

  outputDir = outputDir || await getRandomDirectory();

  // Decode the Base64 image and write it to a temporary file.
  const base64Data = inputImageInBase64.substring(inputImageInBase64.indexOf(',') + 1);
  const buffer = Buffer.from(base64Data, 'base64');
  const inputImagePath = path.join(outputDir, `${uuidv4()}.png`);
  await writeFile(inputImagePath, buffer);

  const inputImageDetails = await new Promise<ffmpeg.FfprobeData>((resolve, reject) => {
    ffmpeg.ffprobe(inputImagePath, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });

  const originalWidth = inputImageDetails.streams[0].width || width;
  const originalHeight = inputImageDetails.streams[0].height || height;
  const originalAspect = originalWidth / originalHeight;
  const targetAspect = width / height;
  let cropWidth, cropHeight;

  if (originalAspect > targetAspect) {
    // Crop width to match target aspect
    // console.log("imageToVideoBase64 case 1")
    cropHeight = originalHeight;
    cropWidth = Math.floor(cropHeight * targetAspect);
  } else {
    // Crop height to match target aspect
    // console.log("imageToVideoBase64 case 2")
    cropWidth = originalWidth;
    cropHeight = Math.floor(cropWidth / targetAspect);
  }

  // Set the path for the output video.
  outputFilePath = outputFilePath || path.join(outputDir, `output_${uuidv4()}.${outputVideoFormat}`);

  // we want to create a smooth Ken Burns effect
  const durationInSeconds = outputVideoDurationInMs / 1000;
  const framesTotal = durationInSeconds * fps;

  const xCenter = `iw/2-(iw/zoom/2)`;
  const yCenter = `ih/2-(ih/zoom/2)`;

  const startZoom = 1;
  const endZoom = 1 + zoomInRatePerSecond * durationInSeconds;
  
  const zoomDurationFrames = Math.ceil(durationInSeconds * fps); // Total frames for the video

  const videoFilters = [
    `crop=${cropWidth}:${cropHeight}:${(originalWidth - cropWidth) / 2}:${(originalHeight - cropHeight) / 2}`,
    `zoompan=z='min(zoom+${(endZoom - startZoom) / framesTotal}, ${endZoom})':x='${xCenter}':y='${yCenter}':d=${zoomDurationFrames}`
  ].join(',');

  /*
  console.log(`imagetoVideoBase64 called with: ${JSON.stringify({
    inputImageInBase64: inputImageInBase64?.slice(0, 50),
    outputFilePath,
    width,
    height,
    outputVideoDurationInMs,
    outputDir,
    clearOutputDirAtTheEnd,
    outputVideoFormat,
    originalWidth,
    originalHeight,
    originalAspect,
    targetAspect,
    cropHeight,
    cropWidth,
    durationInSeconds,
    framesTotal,
    xCenter,
    yCenter,
    startZoom,
    endZoom,
    zoomDurationFrames,
    videoFilters,
  }, null, 2)}`)
  */
 
  // Process the image to video conversion using ffmpeg.
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputImagePath)
      // this is disabled to avoid repeating the zoom-in multiple times
      // .inputOptions(['-loop 1'])
      .outputOptions([
        `-t ${durationInSeconds}`,
        `-r ${fps}`,
        `-s ${width}x${height}`,
        `-c:v ${codec}`,
        '-tune stillimage',
        '-pix_fmt yuv420p'
      ])
      .videoFilters(videoFilters)
      .on('start', commandLine => console.log('imageToVideoBase64: Spawned Ffmpeg with command: ' + commandLine))
      .on('end', () => resolve())
      .on('error', err => reject(err))
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