<template>
  <el-dialog
    :model-value="modelValue"
    :title="'意见反馈 / Bug 上报'"
    width="480px"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form label-position="top">
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
          :rows="5"
          maxlength="2000"
          show-word-limit
          placeholder="例如：我在「发布作品」时上传图片后点发布没反应……"
        />
      </el-form-item>

      <el-form-item label="联系方式（选填，方便我们回复你）">
        <el-input v-model="contact" maxlength="100" placeholder="手机号 / 邮箱 / 微信，选填" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" :loading="submitting" :disabled="!canSubmit" @click="submit">
        提交反馈
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { feedbackApi } from '@/api'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const type = ref('bug')
const content = ref('')
const contact = ref('')
const submitting = ref(false)

const canSubmit = computed(() => content.value.trim().length >= 2 && !submitting.value)

const close = () => emit('update:modelValue', false)

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
      type.value = 'bug'
      content.value = ''
      contact.value = ''
      close()
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
