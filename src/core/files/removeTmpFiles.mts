import { existsSync, promises as fs } from "node:fs"

import { keepTemporaryFiles } from "../config.mts"

// note: this function will never fail
export async function removeTemporaryFiles(filesPaths: string[]) {
  try {
    if (!keepTemporaryFiles) {
      // Cleanup temporary files - you could choose to do this or leave it to the user
      await Promise.all(filesPaths.map(async (filePath) => {
        try {
          if (existsSync(filePath)) {
            await fs.unlink(filePath)
          }
        } catch (err) {
          //
        }
      }))
    }
  } catch (err) {
    // no big deal, except a bit of tmp file leak
    // although.. if delete failed, it could also indicate
    // that the file has already been cleaned-up, so even better!
  } 
}