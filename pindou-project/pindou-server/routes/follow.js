const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/jwt");

// 关注/取关切换
router.post("/toggle", async (req, res) => {
  try {
    const followeeId = req.body.followeeId ?? req.body.userId ?? req.body.id;
    const token = req.headers.token;
    if (!token) {
      return res.json({ code: 401, msg: "请登录" });
    }

    const followeeIdNum = Number(followeeId);
    if (!Number.isInteger(followeeIdNum) || followeeIdNum <= 0) {
      return res.json({ code: 400, msg: "关注对象无效" });
    }

    const { id } = jwt.verify(token, JWT_SECRET);
    if (Number(id) === followeeIdNum) {
      return res.json({ code: 400, msg: "不能关注自己" });
    }

    const [userRows] = await pool.query(
      "SELECT id FROM users WHERE id=? LIMIT 1",
      [followeeIdNum]
    );
    if (!userRows.length) {
      return res.json({ code: 400, msg: "关注对象不存在" });
    }

    const [exist] = await pool.query(
      "SELECT id FROM follows WHERE follower_id=? AND followee_id=? LIMIT 1",
      [id, followeeIdNum],
    );

    if (exist.length) {
      const [followersBeforeDelete] = await pool.query(
        "SELECT COUNT(*) as count FROM follows WHERE followee_id=?",
        [followeeIdNum]
      );
      await pool.query("DELETE FROM follows WHERE id=?", [exist[0].id]);
      return res.json({
        code: 200,
        msg: "取消关注成功",
        isFollowing: false,
        followers: Math.max(0, Number(followersBeforeDelete[0].count || 0) - 1),
      });
    }

    await pool.query(
      "INSERT INTO follows(follower_id, followee_id) VALUES(?, ?)",
      [id, followeeIdNum],
    );

    await pool.query(
      "INSERT INTO notices(user_id, from_user_id, type, content) VALUES(?,?,?,?)",
      [followeeIdNum, id, "follow", "关注了你"],
    );

    const [followers] = await pool.query(
      "SELECT COUNT(*) as count FROM follows WHERE followee_id=?",
      [followeeIdNum]
    );
    return res.json({
      code: 200,
      msg: "关注成功",
      isFollowing: true,
      followers: Number(followers[0].count || 0),
    });
  } catch (error) {
    console.error('关注切换失败:', error);
    res.json({ code: 500, msg: error.message || "操作失败" });
  }
});

// 我的关注列表
router.get("/myfollow", async (req, res) => {
  try {
    const token = req.headers.token;
    const { id } = jwt.verify(token, JWT_SECRET);
    const [list] = await pool.query(
      `
      SELECT DISTINCT u.* FROM follows f
      INNER JOIN users u ON f.followee_id = u.id
      WHERE f.follower_id = ?
    `,
      [id],
    );
    res.json({ code: 200, list, count: list.length });
  } catch {
    res.json({ code: 401, msg: "请登录" });
  }
});

// 我的粉丝列表
router.get("/myfans", async (req, res) => {
  try {
    const token = req.headers.token;
    const { id } = jwt.verify(token, JWT_SECRET);
    const [list] = await pool.query(
      `
      SELECT DISTINCT u.* FROM follows f
      INNER JOIN users u ON f.follower_id = u.id
      WHERE f.followee_id = ?
    `,
      [id],
    );
    res.json({ code: 200, list, count: list.length });
  } catch {
    res.json({ code: 401, msg: "请登录" });
  }
});

module.exports = router;
