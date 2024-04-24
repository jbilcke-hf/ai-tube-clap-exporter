import { addBase64Header } from "../base64/addBase64.mts";

export async function bufferToJpeg(buffer: Buffer) {
  return addBase64Header(buffer.toString('base64'), "jpeg")
}