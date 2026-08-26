/**
 * 游戏图片的公开地址。
 *
 * QQ Markdown 图片只能使用 QQ 服务端可访问的 HTTP/HTTPS 地址；本地磁盘路径和 Buffer 会降级为富媒体消息，
 * 不能与 Markdown 正文、蓝字和按钮合并。将 pearGuideImageUrl 改为部署后的公开图片地址即可启用单条剧情卡片。
 */
export const gameAssetUrls = {
  pearGuideImageUrl: ''
} as const;

export const isPublicImageUrl = (value: string) => /^https?:\/\/\S+$/i.test(value.trim());
