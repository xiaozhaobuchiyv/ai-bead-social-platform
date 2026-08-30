/**
 * 轻量请求体校验
 * 用法：validate({ title: 'required', content: ['required', 'max:2000'] })
 * 校验失败返回 400 并附带字段错误。
 */
const { HttpError } = require('../utils/errors')

const RULES = {
  required: (value) => value !== undefined && value !== null && String(value).trim() !== '',
  string: (value) => typeof value === 'string',
  number: (value) => typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(String(value || '')),
  array: (value) => Array.isArray(value),
}

function applyRule(rule, value) {
  const [name, param] = String(rule).split(':')
  switch (name) {
    case 'required':
      return RULES.required(value)
    case 'string':
      return RULES.string(value)
    case 'number':
      return RULES.number(value)
    case 'array':
      return RULES.array(value)
    case 'min':
      return value !== undefined && value !== null && Number(value) >= Number(param)
    case 'max':
      return value !== undefined && value !== null && Number(value) <= Number(param)
    case 'maxLen':
      return !value || String(value).length <= Number(param)
    default:
      return true
  }
}

/**
 * @param {object} schema { field: rule | rule[] }
 */
function validate(schema) {
  return (req, res, next) => {
    const body = req.body || {}
    for (const [field, rules] of Object.entries(schema)) {
      const ruleList = Array.isArray(rules) ? rules : [rules]
      for (const rule of ruleList) {
        if (!applyRule(rule, body[field])) {
          const msg = rule === 'required'
            ? `参数 ${field} 不能为空`
            : `参数 ${field} 不符合规则 ${rule}`
          return next(new HttpError(400, msg))
        }
      }
    }
    next()
  }
}

module.exports = validate
