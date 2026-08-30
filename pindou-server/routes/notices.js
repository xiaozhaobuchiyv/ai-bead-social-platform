const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/jwt");

// 获取通知列表
router.get("/list", async (req, res) => {
  try {
    const token = req.headers.token;
    if (!token) {
      return res.json({ code: 401, msg: "请先登录" });
    }
    const { id } = jwt.verify(token, JWT_SECRET);

    const [list] = await pool.query(
      `SELECT n.*, u.nickname as from_nickname, u.avatar as from_avatar,
              nb.title as note_title, nb.images as note_images,
              EXISTS(SELECT 1 FROM comment_likes cl WHERE cl.comment_id = n.comment_id AND cl.user_id = ?) AS liked
       FROM notices n
       LEFT JOIN users u ON n.from_user_id = u.id
       LEFT JOIN notes nb ON n.note_id = nb.id
       WHERE n.user_id = ?
       ORDER BY n.create_time DESC
       LIMIT 50`,
      [id, id]
    );

    // 提取笔记首图作缩略图
    const resultList = list.map((item) => {
      let note_cover = null;
      try {
        const imgs = JSON.parse(item.note_images || '[]');
        note_cover = Array.isArray(imgs) && imgs.length ? imgs[0] : null;
      } catch {
        note_cover = null;
      }
      const { note_images, ...rest } = item;
      return { ...rest, note_cover };
    });

    res.json({ code: 200, list: resultList });
  } catch (error) {
    console.error('获取通知列表失败:', error);
    res.json({ code: 500, msg: "获取失败" });
  }
});

// 标记单条通知为已读
router.post("/read/:noticeId", async (req, res) => {
  try {
    const token = req.headers.token;
    if (!token) {
      return res.json({ code: 401, msg: "请先登录" });
    }
    const { id } = jwt.verify(token, JWT_SECRET);

    await pool.query(
      "UPDATE notices SET is_read = 1 WHERE id = ? AND user_id = ?",
      [req.params.noticeId, id]
    );

    res.json({ code: 200, msg: "已标记为已读" });
  } catch (error) {
    console.error('标记已读失败:', error);
    res.json({ code: 500, msg: "操作失败" });
  }
});

// 标记所有通知为已读
router.post("/readall", async (req, res) => {
  try {
    const token = req.headers.token;
    if (!token) {
      return res.json({ code: 401, msg: "请先登录" });
    }
    const { id } = jwt.verify(token, JWT_SECRET);

    await pool.query(
      "UPDATE notices SET is_read = 1 WHERE user_id = ?",
      [id]
    );

    res.json({ code: 200, msg: "已全部标记为已读" });
  } catch (error) {
    console.error('标记已读失败:', error);
    res.json({ code: 500, msg: "操作失败" });
  }
});

// 未读通知数量
router.get("/unread/count", async (req, res) => {
  try {
    const token = req.headers.token;
    if (!token) {
      return res.json({ code: 401, msg: "请先登录" });
    }
    const { id } = jwt.verify(token, JWT_SECRET);
    const [rows] = await pool.query(
      "SELECT COUNT(*) as count FROM notices WHERE user_id = ? AND is_read = 0",
      [id]
    );
    res.json({ code: 200, count: rows[0].count || 0 });
  } catch (error) {
    console.error("获取未读通知数失败:", error);
    res.json({ code: 500, msg: "获取失败" });
  }
});

// 创建通知（内部使用）
const createNotice = async (userId, fromUserId, type, noteId, commentId, content) => {
  try {
    await pool.query(
      "INSERT INTO notices(user_id, from_user_id, type, note_id, comment_id, content) VALUES(?,?,?,?,?,?)",
      [userId, fromUserId, type, noteId, commentId, content]
    );
  } catch (error) {
    console.error('创建通知失败:', error);
  }
};

module.exports = router;
module.exports.createNotice = createNotice;
