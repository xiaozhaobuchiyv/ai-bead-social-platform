-- 创建私信消息表
CREATE TABLE IF NOT EXISTS messages (
  id INT PRIMARY KEY AUTO_INCREMENT COMMENT '消息ID',
  from_user_id INT NOT NULL COMMENT '发送者ID',
  to_user_id INT NOT NULL COMMENT '接收者ID',
  content TEXT NOT NULL COMMENT '消息内容',
  is_read INT DEFAULT 0 COMMENT '是否已读 0-未读 1-已读',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间',
  FOREIGN KEY (from_user_id) REFERENCES users(id),
  FOREIGN KEY (to_user_id) REFERENCES users(id),
  INDEX idx_from_to (from_user_id, to_user_id),
  INDEX idx_to_from (to_user_id, from_user_id),
  INDEX idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='私信消息表';

-- 创建会话列表表
CREATE TABLE IF NOT EXISTS conversations (
  id INT PRIMARY KEY AUTO_INCREMENT COMMENT '会话ID',
  user_id INT NOT NULL COMMENT '当前用户ID',
  target_user_id INT NOT NULL COMMENT '对方用户ID',
  last_message TEXT COMMENT '最后一条消息预览',
  unread_count INT DEFAULT 0 COMMENT '未读消息数',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (target_user_id) REFERENCES users(id),
  UNIQUE KEY idx_user_target (user_id, target_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会话列表表';

INSERT INTO conversations (user_id, target_user_id, last_message, unread_count) VALUES
(1, 2, '你好！', 1),
(1, 3, '最近忙什么呢？', 0),
(2, 1, '你好！我是用户2', 0);

INSERT INTO messages (from_user_id, to_user_id, content, is_read) VALUES
(2, 1, '你好！', 0),
(3, 1, '最近忙什么呢？', 1),
(1, 2, '你好！我是用户1', 1),
(2, 1, '很高兴认识你', 1);