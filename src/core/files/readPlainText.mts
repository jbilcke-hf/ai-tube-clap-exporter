import { promises as fs } from "fs"

export async function readPlainText(filePath: string): Promise<string> {
  try {
    const plainText = await fs.readFile(filePath, "utf-8");

    return plainText;
  } catch (error) {
    // Handle errors (e.g., file not found, no permissions, etc.)
    console.error(error);
    throw error;
  }
}
