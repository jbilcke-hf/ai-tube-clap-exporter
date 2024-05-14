import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

import { v4 as uuidv4 } from "uuid"
import puppeteer from "puppeteer"

export async function htmlToBase64Png({
  outputImagePath,
  html = "",
  width = 800,
  height = 600,
}: {
  outputImagePath?: string
  html?: string
  width?: number
  height: number
}): Promise<{
  filePath: string
  buffer: Buffer
}> {

  // If no output path is provided, create a temporary file for output
  if (!outputImagePath) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), uuidv4()))

    outputImagePath = path.join(tempDir, `${uuidv4()}.png`)
  }

  const browser = await puppeteer.launch({
    headless: true,

    // for macOS do this (yeah.. with the "no quarantine"..)
    // brew install chromium --no-quarantine
    // and:
    // which chromium
    // to detect where the executable path is

    // apparently we need those, see:
    // https://unix.stackexchange.com/questions/694734/puppeteer-in-alpine-docker-with-chromium-headless-dosent-seems-to-work
    // https://stackoverflow.com/questions/59979188/error-failed-to-launch-the-browser-process-puppeteer
    executablePath:
    os.type() === "Darwin"
    ? '/opt/homebrew/bin/chromium'
    : '/usr/bin/chromium-browser',

    args: [
      '--no-sandbox', // for alpine
      '--headless',
      '--no-zygote',
      // '--single-process',
      '--disable-gpu',
      '--disable-dev-shm-usage'
    ]
  })

  try {
    const page = await browser.newPage()

    page.setViewport({
      width,
      height,
    })

    try {
      await page.setContent(html)

      const content = await page.$("body")

      if (!content) { throw new Error (`coudln't find body content`) }
      
      const buffer = await content.screenshot({
        path: outputImagePath,
        omitBackground: true,
        captureBeyondViewport: false,

        // we must keep PNG here, if we want transparent backgrounds
        type: "png",

        // we should leave it to binary (the default value) if we save to a file
        // encoding: "binary", // "base64",
      })

      return {
        filePath: outputImagePath,
        buffer
      }
    } catch (err) {
      throw err
    } finally {
      await page.close()
    }
  } catch (err) {
    throw err
  } finally {
    await browser.close()
  }
};