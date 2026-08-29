const mysql = require('mysql2/promise');
const config = require('./index');

// 企业级连接池：限制上限、自动回收空闲连接
const pool = mysql.createPool({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  charset: config.db.charset,
  connectionLimit: config.db.connectionLimit,
  waitForConnections: true,
  queueLimit: 0,
});

module.exports = pool;
