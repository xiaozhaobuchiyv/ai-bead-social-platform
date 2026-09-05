const mysql = require('mysql2/promise');
const config = require('./index');

// 企业级连接池：上限、自动回收空闲连接；支持托管 MySQL 的端口与 TLS
const poolConfig = {
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  charset: config.db.charset,
  connectionLimit: config.db.connectionLimit,
  waitForConnections: true,
  queueLimit: 0,
};
if (config.db.port) poolConfig.port = config.db.port;
if (config.db.ssl) poolConfig.ssl = config.db.ssl;

const pool = mysql.createPool(poolConfig);

module.exports = pool;
