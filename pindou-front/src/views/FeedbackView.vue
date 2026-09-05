<template>
  <div class="feedback-page">
    <div class="feedback-card">
      <div class="feedback-head">
        <h2><el-icon :size="20" color="#2ec4b5" style="vertical-align: -2px; margin-right: 6px"><ChatDotRound /></el-icon>意见反馈 / Bug 上报</h2>
        <p>遇到 Bug、有功能建议或想聊两句？写下来告诉我们~ 我们会定期查收处理。</p>
      </div>

      <el-form label-position="top" class="feedback-form">
        <el-form-item label="反馈类型">
          <el-radio-group v-model="type">
            <el-radio-button value="bug">Bug 上报</el-radio-button>
            <el-radio-button value="suggestion">功能建议</el-radio-button>
            <el-radio-button value="other">其它</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="反馈内容（必填）">
          <el-input
            v-model="content"
            type="textarea"
            :rows="6"
            maxlength="2000"
            show-word-limit
            placeholder="例如：我在「发布作品」时上传图片后点发布没反应……&#10;描述得越具体，越容易被处理：做了什么操作 → 出现了什么现象"
          />
        </el-form-item>

        <el-form-item label="联系方式（选填，方便我们回复你）">
          <el-input v-model="contact" maxlength="100" placeholder="手机号 / 邮箱 / 微信，选填" />
        </el-form-item>

        <div class="feedback-actions">
          <el-button class="back-btn" @click="$router.back()">返回</el-button>
          <el-button type="primary" class="submit-btn" :loading="submitting" :disabled="!canSubmit" @click="submit">
            提交反馈
          </el-button>
        </div>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { feedbackApi } from '@/api'

const type = ref('bug')
const content = ref('')
const contact = ref('')
const submitting = ref(false)

const canSubmit = computed(() => content.value.trim().length >= 2 && !submitting.value)

const submit = async () => {
  if (!canSubmit.value) return
  submitting.value = true
  try {
    const res = await feedbackApi.submit({
      type: type.value,
      content: content.value.trim(),
      contact: contact.value.trim(),
    })
    if (res.code === 200) {
      ElMessage.success('反馈已提交，感谢你的支持~')
      content.value = ''
      contact.value = ''
      type.value = 'bug'
    } else {
      ElMessage.error(res.msg || '提交失败，请稍后再试')
    }
  } catch (error) {
    ElMessage.error(error?.msg || error?.message || '提交失败，请稍后再试')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped lang="scss">
.feedback-page {
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 48px 16px;
  box-sizing: border-box;
  background: radial-gradient(circle at top, #f4fffd 0, #eef8f7 35%, #f6f8ff 100%);

  .feedback-card {
    width: min(620px, 100%);
    background: #fff;
    border-radius: 20px;
    padding: 32px 36px;
    box-shadow: 0 12px 40px rgba(46, 196, 181, 0.1);

    .feedback-head {
      margin-bottom: 24px;

      h2 {
        margin: 0 0 8px;
        color: #2d3436;
        font-size: 20px;
      }

      p {
        margin: 0;
        color: #84939a;
        font-size: 13px;
        line-height: 1.6;
      }
    }

    .feedback-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 8px;
    }
  }
}
</style>
