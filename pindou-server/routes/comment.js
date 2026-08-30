const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/jwt");

// 发表评论 / 回复评论
router.post("/add", async (req, res) => {
  try {
    const { noteId, content, replyTo, mentionIds } = req.body;
    const token = req.headers.token;
    if (!token) return res.json({ code: 401, msg: "请登录" });
    if (!noteId || !content?.trim()) return res.json({ code: 400, msg: "评论内容不能为空" });

    const { id } = jwt.verify(token, JWT_SECRET);
    const [result] = await pool.query(
      "INSERT INTO comments(note_id,user_id,content,reply_to) VALUES(?,?,?,?)",
      [noteId, id, content.trim(), replyTo || null],
    );

    const [noteInfo] = await pool.query("SELECT user_id, title, content FROM notes WHERE id = ?", [noteId]);
    if (noteInfo.length > 0 && noteInfo[0].user_id !== id) {
      await pool.query(
        "INSERT INTO notices(user_id, from_user_id, type, note_id, comment_id, content) VALUES(?,?,?,?,?,?)",
        [noteInfo[0].user_id, id, 'comment', noteId, result.insertId, content.trim()]
      );
    }

    if (replyTo) {
      const [replyComment] = await pool.query("SELECT user_id FROM comments WHERE id = ?", [replyTo]);
      if (replyComment.length > 0 && replyComment[0].user_id !== id) {
        await pool.query(
          "INSERT INTO notices(user_id, from_user_id, type, note_id, comment_id, content) VALUES(?,?,?,?,?,?)",
          [replyComment[0].user_id, id, 'comment', noteId, result.insertId, content.trim()]
        );
      }
    }

    // @ 提及他人：优先使用前端传的 mentionIds，再用正则解析 @昵称 兜底，为被提及用户生成「@ 我」通知
    const mentionTargetIds = new Set();
    if (Array.isArray(mentionIds)) {
      mentionIds.forEach((uid) => {
        const n = Number(uid);
        if (n) mentionTargetIds.add(n);
      });
    }
    const mentionNames = new Set();
    const mentionRegex = /@([^\s@，。、：:！!?？]{1,30})/g;
    let mm;
    while ((mm = mentionRegex.exec(content.trim())) !== null) {
      const name = mm[1].trim();
      if (name) mentionNames.add(name);
    }
    if (mentionNames.size > 0) {
      const names = Array.from(mentionNames);
      const ph = names.map(() => "?").join(",");
      const [matchedUsers] = await pool.query(
        `SELECT id FROM users WHERE nickname IN (${ph}) OR username IN (${ph})`,
        [...names, ...names]
      );
      matchedUsers.forEach((u) => {
        const n = Number(u.id);
        if (n) mentionTargetIds.add(n);
      });
    }
    for (const uid of mentionTargetIds) {
      if (Number(uid) === Number(id)) continue;
      await pool.query(
        "INSERT INTO notices(user_id, from_user_id, type, note_id, comment_id, content) VALUES(?,?,?,?,?,?)",
        [uid, id, 'mention', noteId, result.insertId, content.trim()]
      );
    }

    res.json({ code: 200, msg: "评论成功", id: result.insertId });
  } catch (error) {
    console.error('评论失败:', error);
    res.json({ code: 500, msg: "评论失败" });
  }
});

// 删除评论：评论作者、笔记作者可删除
router.post("/delete/:id", async (req, res) => {
  try {
    const token = req.headers.token;
    if (!token) return res.json({ code: 401, msg: "请登录" });

    const { id: userId } = jwt.verify(token, JWT_SECRET);
    const commentId = req.params.id;
    const [rows] = await pool.query(
      `SELECT c.user_id, c.note_id, n.user_id AS note_user_id
       FROM comments c
       LEFT JOIN notes n ON c.note_id = n.id
       WHERE c.id = ?`,
      [commentId]
    );
    if (!rows.length) return res.json({ code: 404, msg: "评论不存在" });
    if (rows[0].user_id !== userId && rows[0].note_user_id !== userId) {
      return res.json({ code: 403, msg: "无权限删除评论" });
    }

    await pool.query("DELETE FROM comments WHERE id = ?", [commentId]);
    res.json({ code: 200, msg: "删除成功" });
  } catch (error) {
    console.error('删除评论失败:', error);
    res.json({ code: 500, msg: "删除失败" });
  }
});

// 获取评论列表
router.get("/list/:noteId", async (req, res) => {
  try {
    const token = req.headers.token;
    let userId = null;
    if (token) {
      try { userId = jwt.verify(token, JWT_SECRET).id; } catch {}
    }
    const [list] = await pool.query(
      `SELECT c.*, u.nickname, u.avatar,
              ru.nickname AS reply_nickname,
              ru.id AS reply_user_id,
              (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id) AS like_count,
              EXISTS(SELECT 1 FROM comment_likes cl2 WHERE cl2.comment_id = c.id AND cl2.user_id = ?) AS liked
       FROM comments c
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN comments rc ON c.reply_to = rc.id
       LEFT JOIN users ru ON rc.user_id = ru.id
       WHERE c.note_id=?
       ORDER BY c.create_time ASC`,
      [userId, req.params.noteId],
    );
    const [noteRows] = await pool.query("SELECT user_id FROM notes WHERE id = ?", [req.params.noteId]);
    const noteUserId = noteRows[0]?.user_id;
    const result = list.map((item) => ({
      ...item,
      liked: !!item.liked,
      like_count: Number(item.like_count || 0),
      canDelete: item.user_id === userId || noteUserId === userId,
    }));
    res.json({ code: 200, list: result });
  } catch (error) {
    console.error('获取评论失败:', error);
    res.json({ code: 500, msg: "获取评论失败" });
  }
});

// 点赞 / 取消点赞评论（持久化到 comment_likes 表）
router.post("/like/:commentId", async (req, res) => {
  try {
    const token = req.headers.token;
    if (!token) return res.json({ code: 401, msg: "请登录" });
    const { id: userId } = jwt.verify(token, JWT_SECRET);
    const commentId = req.params.commentId;

    const [commentRows] = await pool.query("SELECT id FROM comments WHERE id = ?", [commentId]);
    if (!commentRows.length) return res.json({ code: 404, msg: "评论不存在" });

    const [existing] = await pool.query(
      "SELECT id FROM comment_likes WHERE user_id=? AND comment_id=? LIMIT 1",
      [userId, commentId]
    );
    let liked = false;
    if (existing.length) {
      await pool.query("DELETE FROM comment_likes WHERE id=?", [existing[0].id]);
    } else {
      await pool.query("INSERT INTO comment_likes(user_id, comment_id) VALUES(?,?)", [userId, commentId]);
      liked = true;
    }
    const [[{ count }]] = await pool.query(
      "SELECT COUNT(*) AS count FROM comment_likes WHERE comment_id=?",
      [commentId]
    );
    res.json({ code: 200, liked, like_count: count || 0 });
  } catch (error) {
    console.error('评论点赞失败:', error);
    res.json({ code: 500, msg: "评论点赞失败" });
  }
});

// 评论点赞表（幂等，确保旧库有表）
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comment_likes (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        comment_id INT NOT NULL,
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_user_comment (user_id, comment_id),
        KEY idx_comment (comment_id),
        CONSTRAINT fk_cl_user FOREIGN KEY (user_id) REFERENCES users(id),
        CONSTRAINT fk_cl_comment FOREIGN KEY (comment_id) REFERENCES comments(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='评论点赞表'
    `);
  } catch (e) {
    console.error('创建评论点赞表失败:', e);
  }
})();

// 启动确认日志：方便验证新代码（评论点赞路由）是否已加载
console.log('[comment] 评论路由已加载（含 POST /like/:commentId 评论点赞）');

module.exports = router;
