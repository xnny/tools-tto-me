import { Secret, TOTP } from 'otpauth'

export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512'

export interface TotpConfig {
  issuer: string
  label: string
  secret: string
  algorithm: TotpAlgorithm
  digits: 6 | 8
  period: number
}

export interface TotpRecord extends TotpConfig {
  id: number
  createdAt: number
}

const normalizeSecret = (input: string): string => {
  const value = input.replace(/\s/g, '').toUpperCase()
  if (!/^[A-Z2-7]+=*$/.test(value)) {
    throw new Error('请输入有效的 Base32 密钥（字母 A–Z 和数字 2–7）。')
  }

  const secret = value.replace(/=+$/, '')
  const padding = value.length - secret.length
  const expectedPadding = new Map([
    [0, 0],
    [2, 6],
    [4, 4],
    [5, 3],
    [7, 1],
  ]).get(secret.length % 8)

  // Check both padding and unused trailing bits; decoding alone can silently
  // discard a malformed final character and change the submitted secret.
  if (
    expectedPadding === undefined ||
    (padding > 0 && padding !== expectedPadding) ||
    Secret.fromBase32(secret).base32 !== secret
  ) {
    throw new Error('密钥的 Base32 长度、填充或末尾字符无效，请检查是否复制完整。')
  }
  return secret
}

const normalizeConfig = (config: TotpConfig, requireLabel: boolean): TotpConfig => {
  const label = config.label.trim()
  const issuer = config.issuer.trim()
  if (requireLabel && !label) throw new Error('请输入账号名称。')
  const algorithm = config.algorithm.toUpperCase()
  if (!['SHA1', 'SHA256', 'SHA512'].includes(algorithm)) {
    throw new Error('仅支持 SHA1、SHA256 和 SHA512 算法。')
  }
  if (config.digits !== 6 && config.digits !== 8) {
    throw new Error('验证码位数必须为 6 或 8。')
  }
  if (config.period <= 0 || !Number.isSafeInteger(config.period * 1000)) {
    throw new Error('刷新周期必须为正整数秒。')
  }
  if (!Number.isInteger(config.period)) {
    throw new Error('刷新周期必须为正整数秒。')
  }
  return {
    issuer,
    label,
    secret: normalizeSecret(config.secret),
    algorithm: algorithm as TotpAlgorithm,
    digits: config.digits,
    period: config.period,
  }
}

export const validateTotpConfig = (config: TotpConfig): TotpConfig => normalizeConfig(config, true)

/** URI options use the protocol defaults, independent of the current form. */
export const parseTotpInput = (input: string, defaults: Partial<TotpConfig> = {}): TotpConfig => {
  const value = input.trim()
  if (/^otpauth-migration:/i.test(value)) {
    throw new Error('暂不支持 Google Authenticator 批量迁移二维码，请使用单个账号的密钥二维码。')
  }
  if (!/^otpauth:/i.test(value)) {
    return normalizeConfig(
      {
        issuer: defaults.issuer ?? '',
        label: defaults.label ?? '',
        algorithm: defaults.algorithm ?? 'SHA1',
        digits: defaults.digits ?? 6,
        period: defaults.period ?? 30,
        secret: value,
      },
      false,
    )
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('两步验证链接格式无效。')
  }
  if (url.hostname.toLowerCase() !== 'totp') {
    throw new Error('仅支持基于时间的 TOTP 密钥，暂不支持 HOTP。')
  }
  if (url.username || url.password || url.port || url.hash) {
    throw new Error('两步验证链接格式无效。')
  }

  const params = new URLSearchParams()
  for (const [key, value] of url.searchParams) params.append(key.toLowerCase(), value)
  for (const key of ['secret', 'issuer', 'algorithm', 'digits', 'period']) {
    if (params.getAll(key).length > 1) {
      throw new Error('两步验证链接含重复参数，请检查原始链接。')
    }
  }
  const rawDigits = params.get('digits') ?? '6'
  const rawPeriod = params.get('period') ?? '30'
  if (!/^\d+$/.test(rawDigits) || !/^\d+$/.test(rawPeriod)) {
    throw new Error('验证码位数和刷新周期必须为正整数。')
  }

  let decodedLabel: string
  try {
    decodedLabel = decodeURIComponent(url.pathname.slice(1))
  } catch {
    throw new Error('两步验证链接的账号名称编码无效。')
  }
  const separator = decodedLabel.indexOf(':')
  const issuerPrefix = separator >= 0 ? decodedLabel.slice(0, separator).trim() : ''
  const issuerParam = params.get('issuer')?.trim()
  if (issuerPrefix && issuerParam !== undefined && issuerPrefix !== issuerParam) {
    throw new Error('两步验证链接中的服务名称不一致，请检查原始链接。')
  }

  return normalizeConfig(
    {
      issuer: issuerParam ?? issuerPrefix,
      label: separator >= 0 ? decodedLabel.slice(separator + 1) : decodedLabel,
      secret: params.get('secret') ?? '',
      algorithm: (params.get('algorithm') ?? 'SHA1') as TotpAlgorithm,
      digits: Number(rawDigits) as 6 | 8,
      period: Number(rawPeriod),
    },
    false,
  )
}

export const getTotpState = (
  config: TotpConfig,
  timestamp = Date.now(),
): { code: string; remaining: number } => {
  const totp = new TOTP(validateTotpConfig(config))
  return {
    code: totp.generate({ timestamp }),
    remaining: Math.ceil(totp.remaining({ timestamp }) / 1000),
  }
}

export const exportTotpRecords = (
  records: TotpRecord[],
  now = new Date(),
): { content: string; mimeType: string; filename: string } => {
  const entries = records.map((record) => ({
    id: record.id,
    ...validateTotpConfig(record),
    createdAt: record.createdAt,
  }))
  const exportedAt = now.toISOString()
  return {
    content: JSON.stringify({ version: 1, exportedAt, entries }, null, 2) + '\n',
    mimeType: 'application/json;charset=utf-8',
    filename: `two-factor-${exportedAt.replace(/[:.]/g, '-')}.json`,
  }
}
