/** 不需要登录即可访问的路由路径（白名单） */
export const PUBLIC_ROUTES = ['/', '/designer']

/** 需要登录才能访问的路由路径 */
export const NEED_LOGIN_ROUTES = ['/user', '/publish', '/notice', '/message', '/draft', '/collection', '/pine-xiaodou']

export function routeNeedsLogin(path) {
  // 如果是白名单中的路径，不需要登录
  if (PUBLIC_ROUTES.some((p) => path === p || path.startsWith(p + '/'))) {
    return false
  }
  return NEED_LOGIN_ROUTES.some((p) => path === p || path.startsWith(p + '/'))
}
