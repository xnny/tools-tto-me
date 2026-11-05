import { TOTP } from 'otpauth'
import { validateTotpConfig, type TotpConfig } from './twoFactor'

/** Encode the complete provisioning URI locally, without a remote QR service. */
export const createTwoFactorQr = async (config: TotpConfig): Promise<string> => {
  const normalized = validateTotpConfig(config)
  // Colons separate issuer and account in standard provisioning URIs, including
  // URL-encoded colons. Keep these names intact in storage and JSON export.
  if (normalized.issuer.includes(':') || normalized.label.includes(':')) {
    throw new Error('账号或服务名称含冒号，无法生成标准账号二维码；可通过 JSON 导出保留完整信息。')
  }

  try {
    const { default: QRCode } = await import('qrcode')
    return await QRCode.toDataURL(new TOTP(normalized).toString(), {
      type: 'image/png',
      errorCorrectionLevel: 'M',
      margin: 4,
      scale: 6,
    })
  } catch {
    throw new Error('无法生成二维码，请重试；账号信息过长时可使用 JSON 导出。')
  }
}

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
