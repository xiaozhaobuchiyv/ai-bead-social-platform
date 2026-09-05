-- =====================================================================
-- 拼豆分享平台 数据库结构（完整初始化脚本）
-- 用法：mysql -u root -p < schema.sql
-- 说明：
--   * 全部使用 CREATE TABLE IF NOT EXISTS / 条件建索引，可重复执行（幂等）
--   * 索引设计要点（面试可讲）：
--       - notes.create_time 驱动首页瀑布流倒序分页
--       - actions 唯一键 (user_id, note_id, type) 防重复点赞/收藏
--       - follows 唯一键 (follower_id, followee_id) + followee 单列索引（粉丝数查询）
--       - messages (from,to) / (to,from) 覆盖私信会话与未读数查询
--       - notices (user_id, is_read) 支撑未读角标高频查询
-- =====================================================================

CREATE DATABASE IF NOT EXISTS pindou DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE pindou;

-- ---------------------------------------------------------------
-- 用户表
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id          INT PRIMARY KEY AUTO_INCREMENT COMMENT '用户ID',
  username    VARCHAR(50)  NOT NULL COMMENT '用户名（登录名）',
  password    VARCHAR(255) NOT NULL COMMENT '密码（bcrypt 哈希）',
  nickname    VARCHAR(50)  DEFAULT NULL COMMENT '昵称',
  avatar      VARCHAR(255) DEFAULT '' COMMENT '头像URL',
  mobile      VARCHAR(20)  DEFAULT NULL COMMENT '手机号',
  signature   VARCHAR(200) DEFAULT '' COMMENT '个性签名',
  region      VARCHAR(50)  DEFAULT NULL COMMENT '注册时IP属地',
  create_time DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
  UNIQUE KEY uk_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- ---------------------------------------------------------------
-- 笔记表
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notes (
  id          INT PRIMARY KEY AUTO_INCREMENT COMMENT '笔记ID',
  title       VARCHAR(100)  DEFAULT NULL COMMENT '标题',
  content     TEXT          NOT NULL COMMENT '正文',
  images      TEXT          COMMENT '图片URL数组(JSON)',
  video       VARCHAR(500)  DEFAULT NULL COMMENT '视频URL（笔记为视频笔记时）',
  is_hidden   TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否隐藏(1=仅自己可见，抖音式)',
  user_id     INT           NOT NULL COMMENT '作者ID',
  category    VARCHAR(50)   DEFAULT '其他' COMMENT '分类/话题',
  likes       INT           DEFAULT 0 COMMENT '点赞数（冗余计数）',
  collects    INT           DEFAULT 0 COMMENT '收藏数（冗余计数）',
  region      VARCHAR(50)   DEFAULT NULL COMMENT '发布时IP属地',
  create_time DATETIME      DEFAULT CURRENT_TIMESTAMP COMMENT '发布时间',
  KEY idx_user_id (user_id),
  KEY idx_create_time (create_time),
  KEY idx_user_created (user_id, create_time),
  -- 搜索索引：FULLTEXT + ngram 解析器（中文分词），供 MATCH ... AGAINST 使用
  FULLTEXT KEY ft_notes_search (title, content, category) WITH PARSER ngram,
  CONSTRAINT fk_notes_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笔记表';

-- ---------------------------------------------------------------
-- 点赞/收藏动作表
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS actions (
  id      INT PRIMARY KEY AUTO_INCREMENT COMMENT '动作ID',
  user_id INT NOT NULL COMMENT '操作用户ID',
  note_id INT NOT NULL COMMENT '笔记ID',
  type    ENUM('like','collect') NOT NULL COMMENT '动作类型',
  UNIQUE KEY uniq_user_note_type (user_id, note_id, type),
  KEY idx_note_type (note_id, type),
  CONSTRAINT fk_actions_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_actions_note FOREIGN KEY (note_id) REFERENCES notes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='点赞收藏动作表';

-- ---------------------------------------------------------------
-- 评论表
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
  id          INT PRIMARY KEY AUTO_INCREMENT COMMENT '评论ID',
  note_id     INT NOT NULL COMMENT '笔记ID',
  user_id     INT NOT NULL COMMENT '评论者ID',
  content     TEXT NOT NULL COMMENT '评论内容',
  reply_to    INT DEFAULT NULL COMMENT '回复的评论ID',
  like_count  INT DEFAULT 0 COMMENT '点赞数（冗余计数）',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '评论时间',
  KEY idx_note_id (note_id),
  KEY idx_note_created (note_id, create_time),
  KEY idx_user_id (user_id),
  CONSTRAINT fk_comments_note FOREIGN KEY (note_id) REFERENCES notes(id),
  CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='评论表';

-- ---------------------------------------------------------------
-- 关注表
-- ---------------------------------------------------------------
-- ---------------------------------------------------------------
-- 评论点赞表（持久化评论点赞；前端「给评论点赞」）
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comment_likes (
  id          INT PRIMARY KEY AUTO_INCREMENT COMMENT '点赞ID',
  user_id     INT NOT NULL COMMENT '点赞用户ID',
  comment_id  INT NOT NULL COMMENT '评论ID',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '点赞时间',
  UNIQUE KEY uniq_user_comment (user_id, comment_id),
  KEY idx_comment (comment_id),
  CONSTRAINT fk_comment_likes_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_comment_likes_comment FOREIGN KEY (comment_id) REFERENCES comments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='评论点赞表';

CREATE TABLE IF NOT EXISTS follows (
  id          INT PRIMARY KEY AUTO_INCREMENT COMMENT '关注关系ID',
  follower_id INT NOT NULL COMMENT '粉丝ID',
  followee_id INT NOT NULL COMMENT '被关注者ID',
  UNIQUE KEY uniq_follow (follower_id, followee_id),
  KEY idx_followee (followee_id),
  CONSTRAINT fk_follows_follower FOREIGN KEY (follower_id) REFERENCES users(id),
  CONSTRAINT fk_follows_followee FOREIGN KEY (followee_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='关注关系表';

-- ---------------------------------------------------------------
-- 通知表
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notices (
  id           INT PRIMARY KEY AUTO_INCREMENT COMMENT '通知ID',
  user_id      INT NOT NULL COMMENT '接收通知的用户ID',
  from_user_id INT NOT NULL COMMENT '触发通知的用户ID',
  type         VARCHAR(20) NOT NULL COMMENT '类型: like/collect/comment/follow',
  note_id      INT DEFAULT NULL COMMENT '关联笔记ID',
  comment_id   INT DEFAULT NULL COMMENT '关联评论ID',
  content      TEXT COMMENT '通知内容',
  is_read      TINYINT DEFAULT 0 COMMENT '是否已读 0未读 1已读',
  create_time  DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '通知时间',
  KEY idx_user_read (user_id, is_read),
  KEY idx_user_time (user_id, create_time),
  KEY idx_from_user_id (from_user_id),
  KEY idx_type (type),
  CONSTRAINT fk_notices_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_notices_from FOREIGN KEY (from_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通知表';

-- ---------------------------------------------------------------
-- 私信消息表
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id           INT PRIMARY KEY AUTO_INCREMENT COMMENT '消息ID',
  from_user_id INT NOT NULL COMMENT '发送者ID',
  to_user_id   INT NOT NULL COMMENT '接收者ID',
  content      TEXT NOT NULL COMMENT '消息内容',
  image        VARCHAR(500) DEFAULT NULL COMMENT '图片URL',
  is_read      INT DEFAULT 0 COMMENT '是否已读 0未读 1已读',
  create_time  DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间',
  KEY idx_from_to (from_user_id, to_user_id, create_time),
  KEY idx_to_from (to_user_id, from_user_id, create_time),
  KEY idx_to_read (to_user_id, is_read),
  CONSTRAINT fk_messages_from FOREIGN KEY (from_user_id) REFERENCES users(id),
  CONSTRAINT fk_messages_to FOREIGN KEY (to_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='私信消息表';

-- ---------------------------------------------------------------
-- 草稿表
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drafts (
  id          INT PRIMARY KEY AUTO_INCREMENT COMMENT '草稿ID',
  user_id     INT NOT NULL COMMENT '用户ID',
  title       VARCHAR(255) DEFAULT NULL COMMENT '标题',
  content     TEXT COMMENT '正文',
  images      TEXT COMMENT '图片URL数组(JSON)',
  video       VARCHAR(500) DEFAULT NULL COMMENT '视频URL',
  category    VARCHAR(50)  DEFAULT '其他' COMMENT '分类/话题',
  update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_user_update (user_id, update_time),
  CONSTRAINT fk_drafts_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='草稿表';

-- ---------------------------------------------------------------
-- 拼小豆 AI 会话表
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id                  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '会话ID',
  user_id             BIGINT UNSIGNED DEFAULT NULL COMMENT '用户ID',
  session_title       VARCHAR(255) NOT NULL DEFAULT '拼小豆聊天' COMMENT '会话标题',
  last_message_preview VARCHAR(500) DEFAULT NULL COMMENT '最后一条消息预览',
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  is_deleted          TINYINT(1) NOT NULL DEFAULT 0 COMMENT '软删除标记',
  KEY idx_user_id (user_id),
  KEY idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='拼小豆AI会话表';

-- ---------------------------------------------------------------
-- 拼小豆 AI 消息表
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id         BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT COMMENT '消息ID',
  session_id BIGINT UNSIGNED NOT NULL COMMENT '会话ID',
  role       ENUM('system','user','assistant') NOT NULL COMMENT '消息角色',
  content    LONGTEXT COMMENT '消息文本内容',
  image_urls JSON DEFAULT NULL COMMENT '用户上传图片数组',
  image_url  VARCHAR(1000) DEFAULT NULL COMMENT 'AI生成图片地址',
  msg_type   ENUM('text','image','mixed') NOT NULL DEFAULT 'text' COMMENT '消息类型',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '软删除标记',
  KEY idx_session_id (session_id),
  KEY idx_created_at (created_at),
  CONSTRAINT fk_ai_msg_session FOREIGN KEY (session_id) REFERENCES ai_chat_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='拼小豆AI消息表';

-- ---------------------------------------------------------------
-- 拼豆图纸库（拼小豆 / 图纸转换页 一键保存的图纸）
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pindou_designs (
  id             INT PRIMARY KEY AUTO_INCREMENT COMMENT '图纸ID',
  user_id        INT NOT NULL COMMENT '所属用户ID',
  source_image   LONGTEXT COMMENT '原图地址(dataURL或URL)',
  grid_width     INT NOT NULL DEFAULT 0 COMMENT '图纸网格宽',
  grid_height    INT NOT NULL DEFAULT 0 COMMENT '图纸网格高',
  grid_size      INT NOT NULL DEFAULT 24 COMMENT '生成时网格尺寸',
  max_colors     INT NOT NULL DEFAULT 0 COMMENT '生成时颜色限制(0不限)',
  pixels         LONGTEXT NOT NULL COMMENT '像素色号串(A1,B2,...)',
  palette        TEXT COMMENT '配色方案JSON',
  total_pixels   INT DEFAULT 0 COMMENT '总豆豆数',
  color_count    INT DEFAULT 0 COMMENT '颜色种类',
  similarity     DECIMAL(5,2) DEFAULT 0 COMMENT '与原图相似度%',
  estimated_time VARCHAR(50) DEFAULT NULL COMMENT '预计拼豆耗时',
  preview_image  LONGTEXT COMMENT '图纸预览图(dataURL或URL)',
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  KEY idx_user_created (user_id, created_at),
  CONSTRAINT fk_designs_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='拼豆图纸库';

-- =====================================================================
-- 存量库索引补齐（幂等：仅当索引不存在时创建）
-- =====================================================================
DROP PROCEDURE IF EXISTS ensure_index;
DELIMITER $$
CREATE PROCEDURE ensure_index(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN cols VARCHAR(255))
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND INDEX_NAME = idx
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', tbl, '` ADD INDEX `', idx, '` (', cols, ')');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- 幂等加列（老库升级用）
DROP PROCEDURE IF EXISTS ensure_column;
DELIMITER $$
CREATE PROCEDURE ensure_column(IN tbl VARCHAR(64), IN col VARCHAR(64), IN definition VARCHAR(255))
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- 幂等加 FULLTEXT 索引（中文搜索用 ngram 解析器，老库升级用）
DROP PROCEDURE IF EXISTS ensure_fulltext_index;
DELIMITER $$
CREATE PROCEDURE ensure_fulltext_index(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN cols VARCHAR(255))
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND INDEX_NAME = idx
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', tbl, '` ADD FULLTEXT INDEX `', idx, '` (', cols, ') WITH PARSER ngram');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- 存量库升级：视频字段
CALL ensure_column('notes', 'video', "VARCHAR(500) DEFAULT NULL COMMENT '视频URL'");
CALL ensure_column('drafts', 'video', "VARCHAR(500) DEFAULT NULL COMMENT '视频URL'");
CALL ensure_column('drafts', 'category', "VARCHAR(50) DEFAULT '其他' COMMENT '分类/话题'");
CALL ensure_column('comments', 'like_count', "INT DEFAULT 0 COMMENT '点赞数'");
CALL ensure_column('notes', 'region', "VARCHAR(50) DEFAULT NULL COMMENT 'IP属地'");
CALL ensure_column('users', 'region', "VARCHAR(50) DEFAULT NULL COMMENT 'IP属地'");
CALL ensure_column('notes', 'is_hidden', "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否隐藏(1=仅自己可见)'");
CALL ensure_column('messages', 'image', "VARCHAR(500) DEFAULT NULL COMMENT '图片URL'");

-- notes：首页瀑布流时间倒序
CALL ensure_index('notes', 'idx_create_time', 'create_time');
CALL ensure_index('notes', 'idx_user_created', 'user_id, create_time');

-- comments：笔记下按时间取评论
CALL ensure_index('comments', 'idx_note_created', 'note_id, create_time');

-- follows：粉丝数（被关注者维度）查询
CALL ensure_index('follows', 'idx_followee', 'followee_id');

-- messages：私信会话 / 未读数
CALL ensure_index('messages', 'idx_from_to', 'from_user_id, to_user_id, create_time');
CALL ensure_index('messages', 'idx_to_from', 'to_user_id, from_user_id, create_time');
CALL ensure_index('messages', 'idx_to_read', 'to_user_id, is_read');

-- notices：未读角标
CALL ensure_index('notices', 'idx_user_read', 'user_id, is_read');

-- drafts：我的草稿
CALL ensure_index('drafts', 'idx_user_update', 'user_id, update_time');

-- notes：关键词搜索（标题/内容/分类 中文模糊查询）
CALL ensure_fulltext_index('notes', 'ft_notes_search', 'title, content, category');

DROP PROCEDURE IF EXISTS ensure_index;
DROP PROCEDURE IF EXISTS ensure_fulltext_index;

-- =====================================================================
-- 可选：会话表（当前私信会话由 messages 聚合生成，此表保留兼容）
-- =====================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id             INT PRIMARY KEY AUTO_INCREMENT COMMENT '会话ID',
  user_id        INT NOT NULL COMMENT '当前用户ID',
  target_user_id INT NOT NULL COMMENT '对方用户ID',
  last_message   TEXT COMMENT '最后一条消息预览',
  unread_count   INT DEFAULT 0 COMMENT '未读消息数',
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_user_target (user_id, target_user_id),
  KEY idx_target (target_user_id),
  CONSTRAINT fk_conv_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_conv_target FOREIGN KEY (target_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会话列表表(兼容)';
