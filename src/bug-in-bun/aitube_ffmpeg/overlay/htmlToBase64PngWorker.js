import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

import { UUID } from "@aitube/clap"
import puppeteer from "puppeteer"

const inpDataB64 = process.argv.find((a) => a.startsWith('--input-data')).replace('--input-data', '')
const input = JSON.parse(Buffer.from(inpDataB64, 'base64').toString())

async function htmlToBase64PngWorker(input) {

    let { outputImagePath, html, width, height } = input

    // If no output path is provided, create a temporary file for output
    if (!outputImagePath) {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), UUID()))
        outputImagePath = path.join(tempDir, `${UUID()}.png`)
    }

    const browser = await puppeteer.launch({
        headless: true,
        executablePath: os.type() === "Darwin"
        ? '/opt/homebrew/bin/chromium'
        : '/usr/bin/chromium-browser',
        args: ['--no-sandbox', '--headless', '--disable-gpu', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage()

    page.setViewport({ width, height })

    try {
        await page.setContent(html)

        const content = await page.$("body")

        if (!content) { throw new Error (`Couldn't find body content`) }
        
        const buffer = await content.screenshot({
            path: outputImagePath,
            omitBackground: true,
            captureBeyondViewport: false,
            type: "png",
        })

        const outputData = {
            filePath: outputImagePath,
            buffer
        }
    
        console.log(JSON.stringify(outputData))
    } catch (err) {
        console.error(err)
    } finally {
        await page.close()
        await browser.close()
    }
};

htmlToBase64PngWorker(input);