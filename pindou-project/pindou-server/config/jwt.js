const JWT_SECRET = process.env.JWT_SECRET || 'pindou123'

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[warn] 生产环境请设置环境变量 JWT_SECRET')
}

module.exports = { JWT_SECRET }
