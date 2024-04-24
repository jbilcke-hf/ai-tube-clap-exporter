import { promises as fs } from "fs"

export async function readMp4FileToBase64(filePath: string): Promise<string> {
  try {
    // Read the file's content as a Buffer
    const fileBuffer = await fs.readFile(filePath);

    // Convert the buffer to a base64 string
    const base64 = fileBuffer.toString('base64');

    // Prefix the base64 string with the Data URI scheme for PNG images
    return `data:video/mp4;base64,${base64}`;
  } catch (error) {
    // Handle errors (e.g., file not found, no permissions, etc.)
    console.error(error);
    throw error;
  }
}
