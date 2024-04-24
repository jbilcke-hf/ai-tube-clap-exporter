
import { TextOverlayFont, TextOverlayFontWeight, TextOverlayStyle, getCssStyle } from "../utils/getCssStyle.mts"
import { htmlToBase64Png } from "../converters/htmlToBase64Png.mts"

// generate a PNG overlay using HTML
export async function createTextOverlayImage({
  text = "",
  textStyle = "outline",
  fontFamily = "Montserrat",
  fontSize = 10,
  fontWeight = 600,
  rotation = 0,
  width = 1024,
  height = 576
}: {
  text?: string
  textStyle?: TextOverlayStyle
  fontFamily?: TextOverlayFont
  fontSize?: number
  fontWeight?: TextOverlayFontWeight
  rotation?: number
  width?: number
  height?: number
}): Promise<{
  filePath: string
  buffer: Buffer
}> {


  const html = `<html>
  <head>${getCssStyle({
    fontFamily,
    fontSize,
    fontWeight: 600,
  })}</head>
  <body>

    <!-- main content block (will be center in the middle of the screen) -->
    <div class="content">

      <!-- main line of text -->
      <p class="${textStyle}">
        ${text}
      </p>
    </div>

  </body>
</html>`

  const result = await htmlToBase64Png({
    html,
    width,
    height,
  })

  return result;
};