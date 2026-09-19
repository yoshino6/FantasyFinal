import { start } from 'alemonjs';

// 桌宠 App 独立后端入口：固定以 login=app 启动，
// AlemonJS 会加载本地 @alemonjs/app 占位平台（不建立任何外部连接），
// 游戏核心据此只启动桌宠 App 网关，不加载 QQ 等平台。
const port = process.env.FANTASYFINAL_SERVER_PORT
  ? Number(process.env.FANTASYFINAL_SERVER_PORT)
  : 17117;
start({ input: 'src/index.ts', login: 'app', port });
