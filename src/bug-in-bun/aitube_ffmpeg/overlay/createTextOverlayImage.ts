
import { TextOverlayFont, TextOverlayFontWeight, TextOverlayPosition, TextOverlayStyle, getCssStyle } from "./getCssStyle"
import { htmlToBase64Png } from "./htmlToBase64Png"

// generate a PNG overlay using HTML
// most sizes are in percentage of the image height
export async function createTextOverlayImage({
  text = "",
  textStyle = "outline",
  fontFamily = "Montserrat",

  // the unit is vh (so `fontSize: 4` = 4% of the window height)
  fontSize = 3,

  fontWeight = 600,

  horizontalPosition = "center",

  verticalPosition = "end",

  rotation = 0,

  px = 10,

  py = 10,

  width = 1024,
  height = 512
}: {
  text?: string

  // pre-defined text styling, can be: outline or highlight
  textStyle?: TextOverlayStyle

  fontFamily?: TextOverlayFont

  // font size, in % of the video height
  fontSize?: number

  // font weight, can be one of: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900
  fontWeight?: TextOverlayFontWeight

  // start, center or end
  horizontalPosition?: TextOverlayPosition

  // start, center or end
  verticalPosition?: TextOverlayPosition

  rotation?: number

  // horizontal padding - yes the unit is in vh, *not* vw (so `px: 8` = 8% of the window height)
  px?: number

  // vertical padding - the unit is in vh (so `py: 8` = 8% of the window height)
  py?: number

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
    horizontalPosition,
    verticalPosition,
    px,
    py,
  })}</head>
  <body>

    <!-- main container block -->
    <div class="content ${textStyle}">

      <!-- main line of text -->
      <p class="${textStyle}">
        ${text}
      </p>
    </div><br/><br/>
  </body>
</html>`

  const result = await htmlToBase64Png({
    html,
    width,
    height,
  })

  return result;
};