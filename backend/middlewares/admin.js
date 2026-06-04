const requireAdmin = (req, res, next) => {
  if (!['admin', 'demo'].includes(String(req.user?.role || ''))) {
    res.status(403).json({
      code: 403,
      message: '没有后台访问权限',
      data: null,
    })
    return
  }
  next()
}

module.exports = {
  requireAdmin,
}
