import { promises as fs } from "node:fs"
import path from "node:path"
import { deleteFile } from "./deleteFile.mts"

export const deleteFilesWithName = async (dir: string, name: string, debug?: boolean) => {
  console.log(`deleteFilesWithName(${dir}, ${name})`)
  for (const file of await fs.readdir(dir)) {
    if (file.includes(name)) {
      await deleteFile(path.join(dir, file))
    }
  }
}
