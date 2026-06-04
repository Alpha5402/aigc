const jwt = require('../lib/jwt')
const { db } = require('../lib/db')

const JWT_SECRET = process.env.JWT_SECRET || 'agricloud-demo-change-me'

const fail = (message, code = 400, data = null) => ({ code, message, data })
const findUserById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id)

const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const user = findUserById(payload.sub)
    if (!user) {
      res.status(401).json(fail('用户不存在', 401))
      return
    }
    req.user = user
    next()
  } catch (_error) {
    res.status(401).json(fail('登录已过期，请重新登录', 401))
  }
}

module.exports = {
  requireAuth,
}
