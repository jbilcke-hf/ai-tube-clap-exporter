
import express from "express"
import { Blob } from "buffer"

import { parseClap } from "./core/clap/parseClap.mts"
import { ClapProject } from "./core/clap/types.mts"

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

// the export robot has only one job: to export .clap files
app.post("/export", async (req, res) => {
      
  let data: Uint8Array[] = [];

  req.on("data", (chunk) => {
    data.push(chunk);
  });

  req.on("end", async () => {
    let clapProject: ClapProject
    try {
      let fileData = Buffer.concat(data);
      const clapBlob = new Blob([fileData]);
      clapProject = await parseClap(clapBlob);
      console.log("got a clap project!:", clapProject)
    } catch (err) {
      console.error(`failed to parse the request: ${err}`)
      res.status(500)
      res.write(JSON.stringify({ "error": `${err}` }))
      res.end()
      return
    }
    // TODO read the mp4 file and convert it to 
    res.status(200)
    res.write("TODO")
    res.end()
  });
})

app.listen(port, () => {
  console.log(`Open http://localhost:${port}`)
})