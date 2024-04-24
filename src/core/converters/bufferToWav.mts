import { addBase64Header } from "../base64/addBase64.mts";

export async function bufferToWav(buffer: Buffer) {
  return addBase64Header(buffer.toString('base64'), "wav")
}