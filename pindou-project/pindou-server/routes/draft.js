/**
 * 草稿路由（使用 drafts 表；历史代码曾误用 note_draft 表）
 * 支持图片数组 + 单个视频 URL
 */
const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { imageUpload, imgUrl } = require("../utils/upload");

const mergeImages = (bodyImages, files = []) => {
  let existing = [];
  if (bodyImages) {
    try {
      existing = typeof bodyImages === 'string' ? JSON.parse(bodyImages) : bodyImages;
      if (!Array.isArray(existing)) existing = [];
    } catch {
      existing = [];
    }
  }
  const uploaded = files.map((f) => imgUrl(f.filename));
  return JSON.stringify([...existing, ...uploaded]);
};

// 保存草稿
router.post("/save", requireAuth, (req, res, next) => {
  imageUpload.array('images', 9)(req, res, async (err) => {
    if (err) return res.status(400).json({ code: 400, msg: `文件上传失败: ${err.message}` });
    try {
      const { title = '', content = '', category = '', video } = req.body;
      await pool.query(
        "INSERT INTO drafts(user_id, title, content, images, video, category) VALUES(?,?,?,?,?,?)",
        [req.user.id, title, content, mergeImages(req.body.images, req.files), video || null, category || '其他'],
      );
      res.json({ code: 200, msg: "保存草稿成功" });
    } catch (error) {
      next(error);
    }
  });
});

// 获取我的草稿列表
router.get("/list", requireAuth, async (req, res, next) => {
  try {
    const [list] = await pool.query(
      "SELECT id, title, content, images, video, category, update_time FROM drafts WHERE user_id=? ORDER BY update_time DESC",
      [req.user.id],
    );
    res.json({ code: 200, list });
  } catch (error) {
    next(error);
  }
});

// 草稿详情
router.get("/detail/:draftId", requireAuth, async (req, res, next) => {
  try {
    const [draft] = await pool.query(
      "SELECT * FROM drafts WHERE id=? AND user_id=?",
      [req.params.draftId, req.user.id],
    );
    if (!draft.length) return res.json({ code: 404, msg: "草稿不存在" });
    res.json({ code: 200, draft: draft[0] });
  } catch (error) {
    next(error);
  }
});

// 编辑草稿（共用处理函数）
const handleEdit = (req, res, next) => {
  imageUpload.array('images', 9)(req, res, async (err) => {
    if (err) return res.status(400).json({ code: 400, msg: `文件上传失败: ${err.message}` });
    try {
      const { title = '', content = '', category = '', video } = req.body;
      const images = mergeImages(req.body.images, req.files);
      const [result] = await pool.query(
        "UPDATE drafts SET title=?, content=?, images=?, video=?, category=? WHERE id=? AND user_id=?",
        [title, content, images, video || null, category || '其他', req.params.draftId, req.user.id],
      );
      if (result.affectedRows === 0) return res.json({ code: 404, msg: "草稿不存在或无权限修改" });
      res.json({ code: 200, msg: "草稿修改成功" });
    } catch (error) {
      next(error);
    }
  });
};

router.put("/:draftId", requireAuth, handleEdit);
// 兼容旧版前端：POST /edit/:id
router.post("/edit/:draftId", requireAuth, handleEdit);

// 删除草稿
router.delete("/:draftId", requireAuth, async (req, res, next) => {
  try {
    const [result] = await pool.query("DELETE FROM drafts WHERE id=? AND user_id=?", [
      req.params.draftId,
      req.user.id,
    ]);
    if (result.affectedRows === 0) return res.json({ code: 404, msg: "草稿不存在" });
    res.json({ code: 200, msg: "草稿删除成功" });
  } catch (error) {
    next(error);
  }
});

// 兼容旧版前端：POST /delete/:id
router.post("/delete/:draftId", requireAuth, async (req, res, next) => {
  try {
    const [result] = await pool.query("DELETE FROM drafts WHERE id=? AND user_id=?", [
      req.params.draftId,
      req.user.id,
    ]);
    if (result.affectedRows === 0) return res.json({ code: 404, msg: "草稿不存在" });
    res.json({ code: 200, msg: "草稿删除成功" });
  } catch (error) {
    next(error);
  }
});

// 草稿发布为正式笔记
router.post("/publish/:draftId", requireAuth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const [draftArr] = await connection.query(
      "SELECT * FROM drafts WHERE id=? AND user_id=?",
      [req.params.draftId, req.user.id],
    );
    if (!draftArr.length) return res.json({ code: 400, msg: "草稿不存在" });

    await connection.beginTransaction();
    const draft = draftArr[0];
    await connection.query(
      "INSERT INTO notes(title, content, images, video, user_id, category) VALUES(?,?,?,?,?,?)",
      [draft.title, draft.content, draft.images, draft.video || null, draft.user_id, draft.category || '其他'],
    );
    await connection.query("DELETE FROM drafts WHERE id=? AND user_id=?", [draft.id, draft.user_id]);
    await connection.commit();
    res.json({ code: 200, msg: "发布成功，已移出草稿箱" });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

module.exports = router;
