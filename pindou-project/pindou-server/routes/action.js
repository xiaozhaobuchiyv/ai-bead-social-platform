const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/jwt");
const { createNotice } = require("./notices");

// 点赞/收藏 切换
router.post("/toggle", async (req, res) => {
  try {
    const { noteId, type } = req.body;
    const token = req.headers.token;
    const { id } = jwt.verify(token, JWT_SECRET);

    // 统一收藏动作类型，避免前后端 type 命名不一致导致无法取消收藏
    const normalizedType = type === 'collection' ? 'collect' : type;

    const [exist] = await pool.query(
      "SELECT * FROM actions WHERE user_id=? AND note_id=? AND type=?",
      [id, noteId, normalizedType],
    );

    // 根据type确定字段名
    let fieldName;
    let noticeType;
    if (normalizedType === 'like') {
      fieldName = 'likes';
      noticeType = 'like';
    } else if (normalizedType === 'collect') {
      fieldName = 'collects';
      noticeType = 'collect';
    } else {
      return res.json({ code: 400, msg: "无效的type" });
    }

    if (exist.length) {
      // 取消
      await pool.query("DELETE FROM actions WHERE id=?", [exist[0].id]);
      await pool.query(`UPDATE notes SET ${fieldName} = GREATEST(${fieldName} - 1, 0) WHERE id=?`, [
        noteId,
      ]);
      return res.json({ code: 200, msg: "取消成功", isActive: false });
    } else {
      // 新增
      await pool.query(
        "INSERT INTO actions(user_id,note_id,type) VALUES(?,?,?)",
        [id, noteId, normalizedType],
      );
      await pool.query(`UPDATE notes SET ${fieldName} = ${fieldName} + 1 WHERE id=?`, [
        noteId,
      ]);
      
      // 发送通知
      const [noteInfo] = await pool.query("SELECT user_id, title FROM notes WHERE id = ?", [noteId]);
      if (noteInfo.length > 0 && noteInfo[0].user_id !== id) {
        await createNotice(noteInfo[0].user_id, id, noticeType, noteId, null, noteInfo[0].title);
      }
      
      return res.json({ code: 200, msg: "操作成功", isActive: true });
    }
  } catch (error) {
    console.error('操作失败:', error);
    res.json({ code: 500, msg: "操作失败" });
  }
});

// 获取用户收藏的笔记列表
router.get("/collections", async (req, res) => {
  try {
    const token = req.headers.token;
    if (!token) {
      return res.json({ code: 401, msg: "请先登录" });
    }
    
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      return res.json({ code: 401, msg: "请重新登录" });
    }
    
    const [list] = await pool.query(
      `SELECT n.id, n.title, n.content, n.images, n.video, n.user_id, n.likes, n.collects, n.create_time, 
       (SELECT COUNT(*) FROM comments c WHERE c.note_id = n.id) AS comment_count,
       u.nickname, u.avatar 
       FROM actions a 
       LEFT JOIN notes n ON a.note_id = n.id 
       LEFT JOIN users u ON n.user_id = u.id 
       WHERE a.user_id = ? AND a.type = 'collect' 
       ORDER BY n.create_time DESC`,
      [decoded.id]
    );

    const noteIds = list.map(item => item.id).filter(Boolean);
    const [likedRows] = noteIds.length ? await pool.query(
      "SELECT note_id FROM actions WHERE user_id=? AND type='like' AND note_id IN (?)",
      [decoded.id, noteIds]
    ) : [[]];
    const [collectRows] = noteIds.length ? await pool.query(
      "SELECT note_id FROM actions WHERE user_id=? AND type='collect' AND note_id IN (?)",
      [decoded.id, noteIds]
    ) : [[]];
    const likedSet = new Set(likedRows.map(row => row.note_id));
    const collectedSet = new Set(collectRows.map(row => row.note_id));

    const result = list.map(item => ({
      ...item,
      liked: likedSet.has(item.id),
      collected: collectedSet.has(item.id)
    }));
    
    res.json({ code: 200, list: result });
  } catch (error) {
    console.error('获取收藏列表失败:', error);
    res.json({ code: 500, msg: "获取失败" });
  }
});

// 获取用户点赞的笔记列表
router.get("/likes", async (req, res) => {
  try {
    const token = req.headers.token;
    if (!token) {
      return res.json({ code: 401, msg: "请先登录" });
    }
    
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      return res.json({ code: 401, msg: "请重新登录" });
    }
    
    const [list] = await pool.query(
      `SELECT n.id, n.title, n.content, n.images, n.video, n.user_id, n.likes, n.collects, n.create_time, 
       (SELECT COUNT(*) FROM comments c WHERE c.note_id = n.id) AS comment_count,
       u.nickname, u.avatar 
       FROM actions a 
       LEFT JOIN notes n ON a.note_id = n.id 
       LEFT JOIN users u ON n.user_id = u.id 
       WHERE a.user_id = ? AND a.type = 'like' 
       ORDER BY n.create_time DESC`,
      [decoded.id]
    );

    const noteIds = list.map(item => item.id).filter(Boolean);
    const [likeRows] = noteIds.length ? await pool.query(
      "SELECT note_id FROM actions WHERE user_id=? AND type='like' AND note_id IN (?)",
      [decoded.id, noteIds]
    ) : [[]];
    const [collectRows] = noteIds.length ? await pool.query(
      "SELECT note_id FROM actions WHERE user_id=? AND type='collect' AND note_id IN (?)",
      [decoded.id, noteIds]
    ) : [[]];
    const likedSet = new Set(likeRows.map(row => row.note_id));
    const collectedSet = new Set(collectRows.map(row => row.note_id));

    const result = list.map(item => ({
      ...item,
      liked: likedSet.has(item.id),
      collected: collectedSet.has(item.id)
    }));
    
    res.json({ code: 200, list: result });
  } catch (error) {
    console.error('获取点赞列表失败:', error);
    res.json({ code: 500, msg: "获取失败" });
  }
});

module.exports = router;
