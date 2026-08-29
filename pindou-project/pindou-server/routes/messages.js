const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/jwt");

// 获取会话列表
router.get("/conversations", async (req, res) => {
  try {
    const token = req.headers.token;
    if (!token) {
      return res.json({ code: 401, msg: "请登录" });
    }

    const { id: userId } = jwt.verify(token, JWT_SECRET);

    // 先取出与当前用户有关的消息，再在 JS 中整理成会话列表，避免 SQL 方言/聚合兼容问题
    const [rows] = await pool.query(
      `SELECT 
         m.from_user_id,
         m.to_user_id,
         m.content,
         m.create_time,
         m.is_read,
         u1.nickname AS from_nickname,
         u1.avatar AS from_avatar,
         u2.nickname AS to_nickname,
         u2.avatar AS to_avatar
       FROM messages m
       LEFT JOIN users u1 ON m.from_user_id = u1.id
       LEFT JOIN users u2 ON m.to_user_id = u2.id
       WHERE m.from_user_id = ? OR m.to_user_id = ?
       ORDER BY m.create_time DESC
       LIMIT 500`,
      [userId, userId]
    );

    const conversationMap = new Map();

    for (const message of rows) {
      const targetId = message.from_user_id === userId ? message.to_user_id : message.from_user_id;
      if (conversationMap.has(targetId)) {
        continue;
      }

      const isIncoming = message.to_user_id === userId;
      conversationMap.set(targetId, {
        target_id: targetId,
        nickname: isIncoming ? message.from_nickname : message.to_nickname,
        avatar: isIncoming ? message.from_avatar : message.to_avatar,
        last_time: message.create_time,
        last_message: message.content,
        unread_count: 0,
      });
    }

    const targetIds = [...conversationMap.keys()];
    if (targetIds.length > 0) {
      const placeholders = targetIds.map(() => "?").join(",");
      const [unreadRows] = await pool.query(
        `SELECT from_user_id AS target_id, COUNT(*) AS unread_count
         FROM messages
         WHERE to_user_id = ? AND is_read = 0 AND from_user_id IN (${placeholders})
         GROUP BY from_user_id`,
        [userId, ...targetIds]
      );

      for (const row of unreadRows) {
        const conversation = conversationMap.get(row.target_id);
        if (conversation) {
          conversation.unread_count = Number(row.unread_count) || 0;
        }
      }
    }

    const list = [...conversationMap.values()]
      .sort((a, b) => new Date(b.last_time) - new Date(a.last_time))
      .slice(0, 20);

    res.json({ code: 200, list });
  } catch (error) {
    console.error("获取会话列表失败:", error);
    res.status(500).json({ code: 500, msg: "获取失败" });
  }
});

// 获取与指定用户的聊天记录
router.get("/chat/:targetId", async (req, res) => {
  try {
    const token = req.headers.token;
    if (!token) {
      return res.json({ code: 401, msg: "请登录" });
    }

    const { id: userId } = jwt.verify(token, JWT_SECRET);
    const targetId = parseInt(req.params.targetId);

    // 标记消息为已读
    await pool.query(
      "UPDATE messages SET is_read = 1 WHERE to_user_id = ? AND from_user_id = ?",
      [userId, targetId]
    );

    // 获取消息列表
    const [rows] = await pool.query(
      `SELECT m.*, 
             u1.nickname as from_nickname, u1.avatar as from_avatar,
             u2.nickname as to_nickname, u2.avatar as to_avatar
      FROM messages m
      LEFT JOIN users u1 ON m.from_user_id = u1.id
      LEFT JOIN users u2 ON m.to_user_id = u2.id
      WHERE (m.from_user_id = ? AND m.to_user_id = ?) 
         OR (m.from_user_id = ? AND m.to_user_id = ?)
      ORDER BY m.create_time ASC
      LIMIT 100`,
      [userId, targetId, targetId, userId]
    );

    res.json({ code: 200, list: rows });
  } catch (error) {
    console.error("获取聊天记录失败:", error);
    res.json({ code: 500, msg: "获取失败" });
  }
});

// 发送消息
router.post("/send", async (req, res) => {
  try {
    const token = req.headers.token;
    if (!token) {
      return res.json({ code: 401, msg: "请登录" });
    }

    const { id: userId } = jwt.verify(token, JWT_SECRET);
    const { targetId, content } = req.body;

    if (!content?.trim()) {
      return res.json({ code: 400, msg: "消息内容不能为空" });
    }

    const [result] = await pool.query(
      "INSERT INTO messages(from_user_id, to_user_id, content) VALUES(?, ?, ?)",
      [userId, targetId, content.trim()]
    );

    res.json({
      code: 200,
      msg: "发送成功",
      data: { id: result.insertId, create_time: new Date().toISOString() },
    });
  } catch (error) {
    console.error("发送消息失败:", error);
    res.json({ code: 500, msg: "发送失败" });
  }
});

// 获取未读消息总数
router.get("/unread/count", async (req, res) => {
  try {
    const token = req.headers.token;
    if (!token) {
      return res.json({ code: 401, msg: "请登录" });
    }

    const { id: userId } = jwt.verify(token, JWT_SECRET);

    const [rows] = await pool.query(
      "SELECT COUNT(*) as count FROM messages WHERE to_user_id = ? AND is_read = 0",
      [userId]
    );

    res.json({ code: 200, count: rows[0].count });
  } catch (error) {
    console.error("获取未读消息数失败:", error);
    res.json({ code: 500, msg: "获取失败" });
  }
});

// 一键清理所有未读消息
router.post("/unread/clear", async (req, res) => {
  try {
    const token = req.headers.token;
    if (!token) {
      return res.json({ code: 401, msg: "请登录" });
    }

    const { id: userId } = jwt.verify(token, JWT_SECRET);

    await pool.query(
      "UPDATE messages SET is_read = 1 WHERE to_user_id = ? AND is_read = 0",
      [userId]
    );

    res.json({ code: 200, msg: "清理成功" });
  } catch (error) {
    console.error("清理未读消息失败:", error);
    res.json({ code: 500, msg: "清理失败" });
  }
});

module.exports = router;