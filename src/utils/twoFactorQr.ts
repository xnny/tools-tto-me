/** Decode a local image only; its contents never leave the browser. */
export const readTwoFactorQr = async (file: File): Promise<string> => {
  const supportedType = /^image\/(png|jpeg|webp)$/i.test(file.type)
  const supportedExtension = !file.type && /\.(png|jpe?g|webp)$/i.test(file.name)
  if (!supportedType && !supportedExtension) {
    throw new Error('请选择 PNG、JPEG 或 WebP 格式的二维码截图。')
  }

  try {
    const { default: QrScanner } = await import('qr-scanner')
    const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true })
    return result.data
  } catch (error) {
    if (error === 'No QR code found') {
      throw new Error('未找到可识别的二维码，请上传清晰且包含完整二维码的截图。')
    }
    throw new Error('无法读取二维码截图，请检查图片是否完整后重试。')
  }
}
