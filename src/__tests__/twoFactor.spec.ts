import { describe, expect, it } from 'vitest'
import { Secret } from 'otpauth'
import {
  exportTotpRecords,
  getTotpState,
  parseTotpInput,
  validateTotpConfig,
  type TotpAlgorithm,
  type TotpConfig,
  type TotpRecord,
} from '../utils/twoFactor'

const secret = 'JBSWY3DPEHPK3PXP'
const config: TotpConfig = {
  issuer: 'Example',
  label: 'alice@example.com',
  secret,
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
}

describe('TOTP input', () => {
  it('normalizes manually entered Base32 while preserving chosen options', () => {
    expect(
      parseTotpInput('  jbsw y3dp\nehpk3pxp  ', {
        issuer: ' Example ',
        label: ' alice@example.com ',
        algorithm: 'SHA256',
        digits: 8,
        period: 60,
      }),
    ).toEqual({ ...config, algorithm: 'SHA256', digits: 8, period: 60 })
    expect(parseTotpInput('mzxw6===')).toMatchObject({ secret: 'MZXW6', label: '' })
  })

  it('allows preview before the account name is filled, but prevents saving it', () => {
    const preview = parseTotpInput(secret)
    expect(preview).toMatchObject({
      label: '',
      issuer: '',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    })
    expect(() => validateTotpConfig(preview)).toThrow('账号名称')
    expect(validateTotpConfig({ ...preview, label: ' alice ' }).label).toBe('alice')
    expect(parseTotpInput(`otpauth://totp/?secret=${secret}`).label).toBe('')
  })

  it('parses all URI settings and decodes service and account names', () => {
    expect(
      parseTotpInput(
        `otpauth://totp/${encodeURIComponent('示例 & Co:alice+one@example.com')}?secret=${secret}&issuer=${encodeURIComponent('示例 & Co')}&algorithm=SHA512&digits=8&period=60`,
      ),
    ).toEqual({
      ...config,
      issuer: '示例 & Co',
      label: 'alice+one@example.com',
      algorithm: 'SHA512',
      digits: 8,
      period: 60,
    })
  })

  it('uses URI defaults independently of any previous form settings', () => {
    expect(
      parseTotpInput(`otpauth://totp/alice?secret=${secret}`, {
        issuer: 'Previous',
        algorithm: 'SHA512',
        digits: 8,
        period: 60,
      }),
    ).toEqual({ ...config, issuer: '', label: 'alice' })
    expect(parseTotpInput(`otpauth://totp/Example:alice?secret=${secret}`)).toMatchObject({
      issuer: 'Example',
      label: 'alice',
    })
  })

  it.each(['', 'A', 'ABC', 'MZ', 'MZXW7', 'MZXW6=', 'JBSWY3DP0HPK3PXP', 'AAAA====AAAA'])(
    'rejects invalid Base32 instead of silently changing it: %s',
    (input) => expect(() => parseTotpInput(input)).toThrow('密钥'),
  )

  it.each([
    ['algorithm=MD5', '仅支持 SHA1、SHA256 和 SHA512 算法'],
    ['algorithm=SHA384', '仅支持 SHA1、SHA256 和 SHA512 算法'],
    ['algorithm=', '仅支持 SHA1、SHA256 和 SHA512 算法'],
    ['digits=', '验证码位数和刷新周期必须为正整数'],
    ['digits=7', '验证码位数必须为 6 或 8'],
    ['digits=6x', '验证码位数和刷新周期必须为正整数'],
    ['period=', '验证码位数和刷新周期必须为正整数'],
    ['period=0', '刷新周期必须为正整数秒'],
    ['period=-30', '验证码位数和刷新周期必须为正整数'],
    ['period=30.5', '验证码位数和刷新周期必须为正整数'],
    ['period=30x', '验证码位数和刷新周期必须为正整数'],
    ['period=9007199254740992', '刷新周期必须为正整数秒'],
    ['period=30&period=60', '两步验证链接含重复参数'],
    ['algorithm=SHA1&ALGORITHM=SHA512', '两步验证链接含重复参数'],
    ['secret=AAAAAAAA', '两步验证链接含重复参数'],
  ])('rejects explicitly invalid or ambiguous URI parameters: %s', (params, message) => {
    expect(() => parseTotpInput(`otpauth://totp/alice?secret=${secret}&${params}`)).toThrow(message)
  })

  it.each([NaN, Infinity, 0, -1, 0.5, 30.1])('rejects invalid manual period %s', (period) => {
    expect(() => validateTotpConfig({ ...config, period })).toThrow('刷新周期')
  })

  it('rejects mismatched issuers, malformed encodings and unsupported OTP types', () => {
    expect(() => parseTotpInput(`otpauth://totp/A:alice?secret=${secret}&issuer=B`)).toThrow(
      '不一致',
    )
    expect(() => parseTotpInput(`otpauth://totp/%ZZ?secret=${secret}`)).toThrow('编码')
    expect(() => parseTotpInput(`otpauth://hotp/alice?secret=${secret}&counter=1`)).toThrow('HOTP')
    expect(() => parseTotpInput('otpauth-migration://offline?data=abc')).toThrow('批量迁移')
    expect(() => parseTotpInput(`otpauth://totp/alice?secret=${secret}#unexpected`)).toThrow('格式')
  })
})

const rfcSecrets: Record<TotpAlgorithm, string> = {
  SHA1: '12345678901234567890',
  SHA256: '12345678901234567890123456789012',
  SHA512: '1234567890123456789012345678901234567890123456789012345678901234',
}
// RFC 6238 Appendix B, independent expected values for each supported algorithm.
const vectors: [number, string, string, string][] = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826'],
]

describe('TOTP codes', () => {
  it.each(vectors)(
    'matches RFC 6238 at Unix second %s, including leading zeros',
    (seconds, ...codes) => {
      const algorithms: TotpAlgorithm[] = ['SHA1', 'SHA256', 'SHA512']
      algorithms.forEach((algorithm, index) => {
        expect(
          getTotpState(
            {
              ...config,
              algorithm,
              digits: 8,
              secret: Secret.fromUTF8(rfcSecrets[algorithm]).base32,
            },
            seconds * 1000,
          ).code,
        ).toBe(codes[index])
      })
    },
  )

  it('switches the code and countdown together at the exact period boundary', () => {
    const rfcConfig = { ...config, secret: Secret.fromUTF8(rfcSecrets.SHA1).base32 }
    expect(getTotpState(rfcConfig, 29999)).toEqual({ code: '755224', remaining: 1 })
    expect(getTotpState(rfcConfig, 30000)).toEqual({ code: '287082', remaining: 30 })
    expect(getTotpState(rfcConfig, 59000)).toEqual({ code: '287082', remaining: 1 })
    expect(getTotpState({ ...rfcConfig, period: 60 }, 30000)).toEqual({
      code: '755224',
      remaining: 30,
    })
  })
})

describe('TOTP exports', () => {
  const records: TotpRecord[] = [
    { ...config, id: 2, createdAt: 1234 },
    {
      ...config,
      id: 1,
      issuer: '服务: / 100% & Co',
      label: '账号: + alice@example.com / 50%',
      algorithm: 'SHA256',
      digits: 8,
      period: 60,
      createdAt: 1200,
    },
  ]
  const now = new Date('2026-11-05T10:00:00.000Z')

  it('exports every original field in a versioned JSON document', () => {
    const exported = exportTotpRecords(records, now)
    expect(JSON.parse(exported.content)).toEqual({
      version: 1,
      exportedAt: now.toISOString(),
      entries: records,
    })
    expect(exported.mimeType).toBe('application/json;charset=utf-8')
    expect(exported.filename).toBe('two-factor-2026-11-05T10-00-00-000Z.json')
  })
})
