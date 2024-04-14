import { watermarkLocation, watermarkTextAlign, type WatermarkConfig } from "../store";

export async function getWatermarkRenderer(opts: {
  watermark: WatermarkConfig | null | undefined
  sourceWidth: number
  sourceHeight: number
}): Promise<{
  oWidth: number;
  oHeight: number;
  getWatermarkedImageData(source: CanvasImageSource): ImageData;
  watermarkCanvas?: HTMLCanvasElement;
}> {
  const { watermark, sourceWidth, sourceHeight } = opts;
  if (!watermark) {
    const offCanvas = new OffscreenCanvas(sourceWidth, sourceHeight);
    const offCanvasCtx = offCanvas.getContext('2d', { willReadFrequently: true })!;

    return {
      oWidth: sourceWidth,
      oHeight: sourceHeight,
      getWatermarkedImageData(source) {
        offCanvasCtx.clearRect(0, 0, sourceWidth, sourceHeight)
        offCanvasCtx.drawImage(source, 0, 0)

        return offCanvasCtx.getImageData(0, 0, sourceWidth, sourceHeight)
      }
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = sourceWidth
  canvas.height = watermark.height

  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = watermark.backgroundColor
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  let textX = 0
  switch (watermark.textAlign) {
    // case watermarkTextAlign.left:
    //   textX = 0
    //   ctx.textAlign = 'left'
    //   break

    case watermarkTextAlign.center:
      textX = canvas.width / 2
      ctx.textAlign = 'center'
      break

    case watermarkTextAlign.right:
      textX = canvas.width
      ctx.textAlign = 'right'
      break
  }
  ctx.font = watermark.font
  ctx.fillStyle = watermark.textColor
  ctx.textBaseline = 'middle'
  ctx.fillText(watermark.text, textX, canvas.height / 2)

  let wLeft = 0, wTop = 0
  let sLeft = 0, sTop = 0
  let oWidth = sourceWidth, oHeight = sourceHeight
  switch (watermark.location) {
    case watermarkLocation.above:
      sTop = canvas.height
      oHeight += canvas.height
      break

    case watermarkLocation.below:
      wTop = sourceHeight
      oHeight += canvas.height
      break

    case watermarkLocation.top:
      break

    case watermarkLocation.bottom:
      wTop = oHeight - canvas.height
      break
  }

  const offCanvas = new OffscreenCanvas(oWidth, oHeight);
  const offCanvasCtx = offCanvas.getContext('2d', { willReadFrequently: true })!;

  return {
    oWidth,
    oHeight,
    watermarkCanvas: canvas,
    getWatermarkedImageData(source) {
      offCanvasCtx.clearRect(0, 0, oWidth, oHeight)
      offCanvasCtx.drawImage(source, sLeft, sTop)
      offCanvasCtx.drawImage(canvas, wLeft, wTop)

      return offCanvasCtx.getImageData(0, 0, oWidth, oHeight)
    }
  }
}