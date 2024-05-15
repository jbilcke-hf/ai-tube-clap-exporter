
import { Blob } from "node:buffer"

import express from "express"
import queryString from "query-string"
import { parseClap, ClapProject } from "@aitube/clap"

import { clapToTmpVideoFilePath } from "./main"
// import { defaultExportFormat, type SupportedExportFormat } from "@aitube/ffmpeg"
import { defaultExportFormat, type SupportedExportFormat } from "./bug-in-bun/aitube_ffmpeg"
import { deleteFile } from "@aitube/io"

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
  console.log("receiving POST request")

  const qs = queryString.parseUrl(req.url || "")
  const query = (qs || {}).query

  let format: SupportedExportFormat = defaultExportFormat
  try {
    format = decodeURIComponent(query?.f?.toString() || defaultExportFormat).trim() as SupportedExportFormat
    if (format !== "mp4" && format !== "webm") {
      format = defaultExportFormat
    }
  } catch (err) {}

  let data: Uint8Array[] = [];

  req.on("data", (chunk) => {
    data.push(chunk);
  });

  req.on("end", async () => {
    try {
      let fileData = Buffer.concat(data)

      const clap: ClapProject = await parseClap(new Blob([fileData]));

      // not! that is too large!!!
      console.log("got a clap project:", clap?.meta?.description)

      const {
        tmpWorkDir,
        outputFilePath,
      } = await clapToTmpVideoFilePath({ clap, format })
      
      console.log(`got an output ${format} file at:`, outputFilePath)

      res.download(outputFilePath, async () => {
        // clean-up after ourselves (we clear the whole tmp directory)
        await deleteFile(tmpWorkDir)
        // console.log("cleared the temporary folder")
      })
      return
    } catch (err) {
      console.log(`failed to process the request\n${err}`)
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