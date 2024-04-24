import { addBase64Header } from "../base64/addBase64.mts";

export async function bufferToMp3(buffer: Buffer) {
  return addBase64Header(buffer.toString('base64'), "mp3")
}