
export type TextOverlayStyle =
  | "outline"
  | "highlight"

export type TextOverlayFont =
  | "Montserrat"
  | "Sofia"

export type TextOverlayFontWeight =
  | 100
  | 200
  | 300
  | 400
  | 500
  | 600
  | 700
  | 800
  | 900

export type TextOverlayPosition =
  | "start"
  | "center"
  | "end"

export function getCssStyle({
  width,
  height,
  fontSize,
  fontFamily,
  fontWeight,
  horizontalPosition,
  verticalPosition,
  px,
  py,
}: {
  width?: number | string
  height?: number | string
  fontSize: number
  fontFamily: TextOverlayFont
  fontWeight: TextOverlayFontWeight
  horizontalPosition: TextOverlayPosition
  verticalPosition: TextOverlayPosition
  px: number
  py: number
}) {

  return `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=${fontFamily}:wght@${fontWeight}&display=swap" rel="stylesheet">
  <style>
  body {
    background: transparent !important;
    width: ${width || "100vw"};
    height: ${height || "100vh"};
    overflow: hidden;
    margin: 0;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .content {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: ${
      horizontalPosition
    };
    justify-content: ${
      verticalPosition
    };
  }

  p {
    font-family: "${fontFamily}", sans-serif;
    font-size: ${fontSize}vh;
    font-weight: ${fontWeight};
    border-radius: 2vh;
    padding-top: ${py}vh;
    padding-right: ${px}vh;
    padding-bottom: ${py}vh;
    padding-left: ${px}vh;
    text-align: ${horizontalPosition};

    /*
    normally we should use those webkit features:
    https://kinsta.com/blog/css-text-outline/


    but puppeteer has some glitches (the black lines are not cut properly)
    so we use text shadows instead

    */
    text-shadow:
    ${0.35}vh ${0.35}vh ${0.3}vh #000,
      -${0.35}vh ${0.35}vh ${0.3}vh #000,
      -${0.35}vh -${0.35}vh 0 #000,
      ${0.35}vh -${0.35}vh 0 #000;
  }

  .outline {
    color: white;
    /* -webkit-text-stroke-width: ${0.3}vh; */
    /* -webkit-text-stroke-color: black; */
  }
  .highlight {
    background: white;
    color: black;
  }
  </style>
  `
}