
import express from "express"
import { Blob } from "buffer"

import { parseClap } from "./core/clap/parseClap.mts"
import { ClapProject } from "./core/clap/types.mts"
import { clapToTmpVideoFilePath } from "./main.mts"
import { deleteFile } from "./core/files/deleteFile.mts"

const app = express()
const port = 7860

process.on('unhandledRejection', (reason: string, p: Promise<any>) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason);
})

process.on('uncaughtException', (error: Error) => {
  console.error(`Caught exception: ${error}\n` + `Exception origin: ${error.stack}`);
})

// fix this error: "PayloadTooLargeError: request entity too large"
// there are multiple version because.. yeah well, it's Express!
// app.use(bodyParser.json({limit: '50mb'}));
//app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

app.get("/", async (req, res) => {
  res.status(200)
  res.write(`<html>
  <head></head>
  <body>
    <p style="color: black; font-family: monospace;">
      This API is a component of the Clap-to-MP4 rendering service provided by AiTube.<br/>
      It is used for instance by the Stories Factory.
    </p>
  </body>
<html>`)
  res.end()
})

// the export robot has only one job: to export .clap files
app.post("/", async (req, res) => {
      
  let data: Uint8Array[] = [];

  req.on("data", (chunk) => {
    data.push(chunk);
  });

  req.on("end", async () => {
    let clapProject: ClapProject
    try {
      let fileData = Buffer.concat(data)

      const clap = await parseClap(new Blob([fileData]));
      console.log("got a clap project:", clapProject)

      const {
        tmpWorkDir,
        outputFilePath,
      } = await clapToTmpVideoFilePath({ clap })
      console.log("got an output file at:", outputFilePath)

      res.download(outputFilePath, async () => {
        // clean-up after ourselves (we clear the whole tmp directory)
        await deleteFile(tmpWorkDir)
        console.log("cleared the temporary folder")
      })
      return
    } catch (err) {
      console.error(`failed to parse the request: ${err}`)
      res.status(500)
      res.write(JSON.stringify({ "error": `${err}` }))
      res.end()
      return
    }
  });
})

app.listen(port, () => {
  console.log(`Open http://localhost:${port}`)
})