const crypto = require('node:crypto')

const base64Url = (input) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

const decodeBase64Url = (input) => {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
  return Buffer.from(padded, 'base64').toString('utf8')
}

const sign = (payload, secret, expiresInSeconds) => {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const body = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  }

  const encodedHeader = base64Url(JSON.stringify(header))
  const encodedBody = base64Url(JSON.stringify(body))
  const unsigned = `${encodedHeader}.${encodedBody}`
  const signature = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url')

  return {
    token: `${unsigned}.${signature}`,
    expireAt: body.exp * 1000,
  }
}

const verify = (token, secret) => {
  if (!token || typeof token !== 'string') {
    throw new Error('Token missing')
  }

  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid token')
  }

  const [encodedHeader, encodedBody, signature] = parts
  const unsigned = `${encodedHeader}.${encodedBody}`
  const expected = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url')

  const providedBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new Error('Invalid signature')
  }

  const payload = JSON.parse(decodeBase64Url(encodedBody))
  if (payload.exp && payload.exp * 1000 <= Date.now()) {
    throw new Error('Token expired')
  }

  return payload
}

module.exports = { sign, verify }
