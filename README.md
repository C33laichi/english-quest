# 基于游戏化机制的专升本英语闯关学习系统

**毕业设计作品** · 一个把「背单词、学语法」做成闯关游戏的全栈学习系统

把枯燥的备考变成一场有进度、有等级、有反馈的通关之旅 —— 答题赚积分、解锁关卡、冲击等级与排行榜，用游戏化激励解决专升本备考中「坚持不下去」的核心痛点。

> **完整可跑**：Spring Boot 3 + Vue 3 · 15 张表 · 9 个 REST 控制器 · 53 个接口
> **离线可跑**：不用联网、不用 AI Key，四项 AI 能力自动降级为本地生成，内容真实可用
> **全键盘可玩**：答题、听写、翻页全程不碰鼠标

---

## 一、界面预览

### 学生端主线：登录 → 闯关 → 结算

| 登录页 | 首页 · 等级进度与今日任务 |
|:---:|:---:|
| <img src="screenshots/01-登录页.png" width="100%"><br><sub>学生 / 教师双入口登录</sub> | <img src="screenshots/02-首页.png" width="100%"><br><sub>等级进度、学习入口、连续打卡</sub> |

| 词汇闯关 · 关卡地图 | 词汇答题 |
|:---:|:---:|
| <img src="screenshots/03-词汇关卡.png" width="100%"><br><sub>6 关 / 180 词 / 240 题，逐关解锁</sub> | <img src="screenshots/10-词汇答题.png" width="100%"><br><sub>单选 + 拼写两种题型</sub> |

| 语法路线 · 28 天 | 语法关 · 讲义 + 测验 |
|:---:|:---:|
| <img src="screenshots/04-语法路线.png" width="100%"><br><sub>4 阶段 28 天，按日解锁</sub> | <img src="screenshots/11-语法关卡.png" width="100%"><br><sub>知识点讲义 + 随堂测验</sub> |

### 听力听写：两种难度，逐词判分

| 听力关卡 | 简单模式 · 格宽即词长 |
|:---:|:---:|
| <img src="screenshots/12-听力关卡.png" width="100%"><br><sub>6 关 / 150 句语料</sub> | <img src="screenshots/13-听力简单模式.png" width="100%"><br><sub>打满自动跳格，底衬提示词长</sub> |

| 困难模式 · 零提示 | 逐词红绿判分对照 |
|:---:|:---:|
| <img src="screenshots/14-听力困难模式.png" width="100%"><br><sub>不泄露词数与词长</sub> | <img src="screenshots/20-听力判分逐词对照.png" width="100%"><br><sub>漏词不错位，如实反映水平</sub> |

### 游戏化机制与学习数据

| 游戏中心 | 等级体系（6 级） |
|:---:|:---:|
| <img src="screenshots/05-游戏中心.png" width="100%"><br><sub>每日任务、排行榜、连续打卡</sub> | <img src="screenshots/63-首页-等级提示浮层.png" width="100%"><br><sub>英语学徒 → 专升本王者</sub> |

| 学习看板 | 错题本（三模块混排） |
|:---:|:---:|
| <img src="screenshots/06-学习看板.png" width="100%"><br><sub>热力图 / 正确率趋势 / 知识点雷达</sub> | <img src="screenshots/07-错题本.png" width="100%"><br><sub>词汇 / 语法 / 听力，可朗读重听</sub> |

| 错题针对性讲解 · 跟着你选的错项走 |
|:---:|
| <img src="screenshots/51-语法错题回顾-针对性讲解-深色.png" width="100%"><br><sub>针对实际错选生成讲解，而非通用解析</sub> |

### AI 智能练习

| AI 练习 · 基于错题出同型新题 | 词汇错题 → 单词串烧短文 |
|:---:|:---:|
| <img src="screenshots/08-AI练习.png" width="100%"><br><sub>同型题 / 错题讲解 / 拓展</sub> | <img src="screenshots/64-AI练习-单词串烧.png" width="100%"><br><sub>多选错词串成一篇短文</sub> |

| 语法错题 → 考点拓展 | 个人中心 |
|:---:|:---:|
| <img src="screenshots/65-AI练习-语法拓展.png" width="100%"><br><sub>围绕知识点展开讲解</sub> | <img src="screenshots/09-个人中心.png" width="100%"><br><sub>账号、主题、学习统计</sub> |

### 浅色 / 深色主题（含跟随系统）

| 浅色 · 首页 | 深色 · 首页 |
|:---:|:---:|
| <img src="screenshots/43-主题-浅色-首页.png" width="100%"><br><sub>冷调蓝灰 + 紫靛强调色</sub> | <img src="screenshots/36-主题-深色-首页.png" width="100%"><br><sub>层级靠明度差，不靠描边</sub> |

| 深色 · 学习看板（图表随主题重绘） |
|:---:|
| <img src="screenshots/37-主题-深色-学习看板.png" width="100%"><br><sub>ECharts 运行时解析 CSS 变量重绘</sub> |

### 后台管理

| 后台 · 数据总览 | 用户管理 |
|:---:|:---:|
| <img src="screenshots/15-后台总览.png" width="100%"><br><sub>全局学习数据统计</sub> | <img src="screenshots/16-用户管理.png" width="100%"><br><sub>用户台账与状态管理</sub> |

| 词汇题库 CRUD | 语法题库与讲义管理 |
|:---:|:---:|
| <img src="screenshots/17-词汇题库.png" width="100%"><br><sub>增删改查与解析维护</sub> | <img src="screenshots/18-语法题库.png" width="100%"><br><sub>题目 + 讲义双 Tab</sub> |

---

## 二、系统简介

面向专升本备考学生的英语学习系统，把「背单词、学语法」包装成闯关游戏：
学生通过答题获得积分、解锁关卡、冲击等级与连续打卡，用游戏化激励解决
专升本备考中「坚持不下去」的核心痛点。

### 核心功能

| 模块 | 说明 |
| --- | --- |
| 词汇闯关 | 6 个关卡 / 180 词 / 240 题，单选 + 拼写两种题型，通关解锁下一关 |
| 语法路线 | 28 天语法体系（4 阶段），讲义 + 测验，按日解锁，未通过前一天无法进入下一天 |
| 听力听写 | 6 个关卡 / 150 句语料，**逐词分格输入**（一个格子一个单词）；**简单模式**格子宽度即词长、打满自动跳格，**困难模式**格子随输入动态增长、不泄露词数；逐词比对判分 |
| 游戏化机制 | 积分引擎（每日上限 200、答题类上限 100）、6 级等级体系、连续打卡、每日任务、排行榜 |
| 错题本 | 答错自动收录，支持重练、标记已掌握、按学科筛选（含听力错句，可直接朗读重听） |
| 错题针对性讲解 | 针对**你实际选中的那个错项**生成讲解（不是通用解析），缓存复用、可降级本地生成 |
| AI 智能练习 | 基于错题知识点生成同型新题 / 单词串烧短文 / 语法考点拓展，Mock 本地出题与大模型双通道 |
| 学习数据看板 | 学习热力图（84 天）、正确率趋势（14 天）、知识点雷达图 |
| 后台管理 | 用户管理、词汇题库 CRUD、语法题库与讲义管理、全局数据统计 |

> 全站面向**电脑端键盘输入**设计：左侧导航 + 底部常驻键位条，
> 答题、听写、翻页均可全程不碰鼠标。
> 选择题以功能键区 `1` `2` `3` `4` 为主键位（四键相邻，不易误按），字母键作为备选保留。

---

## 三、工程亮点

这个项目在「能跑」之外，重点处理了几处容易被做成"演示壳子"的地方：

| 亮点 | 一句话说明 |
| --- | --- |
| **听力反作弊** | 困难模式接口只下发中文译文，英文原句与词数全部留在服务端；音频预生成，答案无法从网络响应或 DOM 推断 |
| **LCS 逐词判分** | 漏掉一个词只影响那一个词，不会「漏一个 → 后面全判错」 |
| **积分防刷** | 每笔积分带业务唯一键 `biz_id` + 数据库唯一约束，重复提交不重复发分；另有每日总上限与答题类上限 |
| **AI 三态降级** | 每项 AI 能力都有 `LLM / MOCK / FALLBACK` 三种来源如实标注，**没有 Key 也能全文离线可用**，答辩断网不受影响 |
| **针对性讲解** | 同一题选 B 和选 C 是两种错法，讲解跟着实际错选走，并按 `(模块, 题号, 错选)` 缓存全站复用 |
| **单一强调色设计系统** | 全站唯一强调色 + CSS 变量 token 化，改视觉只改 token；浅色 / 深色 / 跟随系统三态主题，组件样式零改动 |
| **键盘全流程** | 选择题用功能键区数字键作答、听力用逐格输入 + 快捷键重听，整关可以纯键盘完成 |
| **24 个自动化脚本** | 接口回归 + CDP 驱动的真实 Chrome 端到端（含像素级主题判定、音频调用栈诊断） |

展开的技术细节见文末[关键设计说明](#十关键设计说明)。

---

## 四、技术栈

**后端**

- Spring Boot 3.5.5
- MyBatis-Plus 3.5.10.1
- MySQL 8.0（Connector/J 8.0.33）
- Hutool 5.8.35（JWT 签发与校验、BCrypt 密码加密）
- Lombok + Jakarta Validation

**前端**

- Vue 3.5 + Vite 6
- Element Plus 2.8（含中文语言包）
- ECharts 5（学习看板图表）
- Pinia（状态管理）+ Vue Router 4（hash 路由）

**鉴权**：JWT 无状态令牌（有效期 7 天），拦截器 + ThreadLocal 传递当前用户上下文

---

## 五、目录结构

```
english-quest/
├── backend/                 # Spring Boot 后端
│   ├── src/main/java/com/cc/englishquest/
│   │   ├── common/          # 统一响应体 Result、业务异常、分页封装、积分类型常量
│   │   ├── config/          # 鉴权拦截器、CORS、MyBatis-Plus 分页、启动初始化账号
│   │   ├── controller/      # 9 个 REST 控制器（/api/*）
│   │   ├── dto/ vo/         # 请求参数对象 / 响应视图对象
│   │   ├── entity/          # 15 个实体，对应 15 张表
│   │   ├── mapper/          # MyBatis-Plus Mapper（含 StatsMapper 统计 SQL）
│   │   ├── service/         # 业务层（积分引擎、闯关判分、听写判分、AI 出题等）
│   │   └── util/            # JWT 工具、用户上下文
│   └── src/main/resources/application.yml
├── frontend/                # Vue 3 前端
│   ├── public/audio/listen/ # 150 句听力语料音频（预生成 mp3，随构建一起发布）
│   └── src/
│       ├── api/             # axios 封装 + 全部接口定义
│       ├── components/      # 侧边栏、键位条、快捷键面板等公共组件
│       ├── composables/     # 快捷键注册、键位提示、语音朗读
│       ├── router/          # 路由表 + 登录/角色守卫
│       ├── store/           # Pinia 用户状态
│       ├── styles/          # 全局样式与设计变量
│       └── views/           # 学生端 13 页 + 后台 5 页
├── sql/                     # 数据库脚本（建表 + 初始化数据）
├── scripts/                 # 数据/音频生成脚本、测试脚本
└── screenshots/             # 页面截图
```

---

## 六、环境要求

| 依赖 | 版本 |
| --- | --- |
| JDK | 17+ |
| Maven | 3.9+ |
| MySQL | 8.0+ |
| Node.js | 18+ |

---

## 七、快速启动

### 1. 初始化数据库

```bash
mysql -uroot -p < sql/01_schema.sql        # 建库建表（13 张表）
mysql -uroot -p < sql/02_init_vocab.sql    # 词汇：6 关 / 180 词 / 240 题
mysql -uroot -p < sql/03_init_grammar.sql  # 语法：28 天 / 84 题
mysql -uroot -p < sql/04_init_task.sql     # 每日任务配置
mysql -uroot -p < sql/05_init_listen.sql   # 听力：建 2 张表 + 6 关 / 150 句语料
```

> 若数据库是**较早期版本**、只想补新表而不重建全部数据，跑增量脚本即可
> （`CREATE TABLE IF NOT EXISTS`，可反复执行、不会动已有数据）：
>
> ```bash
> mysql -uroot -p english_quest < sql/06_wrong_explain.sql   # 错题针对性讲解缓存表
> ```
>
> 该脚本与 `sql/01_schema.sql` 的第 13 节内容保持一致，改一处要同步另一处。

### 1.1 生成听力音频（首次部署必做）

听力语料音频**不随 Git 仓库提供**，需要跑一次生成脚本（约 1 分钟）：

```bash
pip install edge-tts
python scripts/gen_listen_audio.py
```

脚本会调用微软 Edge 的 Neural 语音（`en-US-AriaNeural`）把 150 句合成 mp3，
输出到 `frontend/public/audio/listen/{句子ID}.mp3`，共约 3.3 MB。
支持断点续传：已存在的文件会跳过，可反复执行。

> 为什么预生成音频而不是运行时合成：听写的答案就是句子本身。
> 如果让浏览器实时朗读，就必须把英文原文下发到前端，答案会暴露在网络响应与 DOM 中，
> 「困难模式」形同虚设。预生成 mp3 后前端只拿到声音、拿不到文本，
> 同时音质接近真人且**离线可播**（答辩断网也不受影响）。

### 2. 配置数据库连接与密钥

出于安全考虑，仓库中**不包含** `backend/src/main/resources/application.yml`
（它保存着数据库口令）。请从模板复制一份，再用**环境变量**注入敏感值：

```bash
cd backend/src/main/resources
cp application-example.yml application.yml
```

所有敏感配置都支持环境变量覆盖，**不必修改 yml 文件**：

| 环境变量 | 用途 | 默认值 |
| --- | --- | --- |
| `DB_USERNAME` | MySQL 账号 | `root` |
| `DB_PASSWORD` | MySQL 口令 | 空 |
| `AI_API_KEY` | DeepSeek API Key（不填则走本地离线生成） | 空 |
| `JWT_SECRET` | 登录令牌签名密钥 | 开发用默认值 |
| `APP_STUDENT_PASSWORD` | 初始化学生账号口令 | 见环境变量说明 |
| `APP_ADMIN_PASSWORD` | 初始化管理员账号口令 | 见环境变量说明 |

Windows PowerShell 示例：

```powershell
$env:DB_PASSWORD = "你的MySQL密码"
$env:AI_API_KEY  = "sk-xxxxxxxx"   # 可选
```

> 若本机 MySQL 的 IPv4 回环（127.0.0.1）不通，请保留 `[::1]`（IPv6 回环）写法。

> 未设置 `AI_API_KEY` 时，四项 AI 能力会自动降级为**本地离线生成**，
> 内容真实可用、不发任何网络请求，答辩断网环境也能完整演示。

### 3. 启动后端（端口 8090）

```bash
cd backend
mvn spring-boot:run
# 或先打包再运行
mvn package -DskipTests && java -jar target/english-quest.jar
```

首次启动会自动创建演示账号（BCrypt 加密入库）。

### 4. 启动前端（端口 5173）

```bash
cd frontend
npm install
npm run dev
```

浏览器访问 <http://127.0.0.1:5173>

### 5. 打包成压缩包（交付 / 换机）

**打包前务必重新构建前端** —— `frontend/dist` 不会自动跟着源码更新，
直接打包会把旧代码交出去：

```bash
cd frontend && npm run build                 # 产物落在 frontend/dist
cd ../backend && mvn package -DskipTests     # 产物 target/english-quest.jar（约 32MB，已含全部依赖）
```

**必须包含**：

| 路径 | 说明 |
| --- | --- |
| `backend/`（源码）+ `pom.xml` | 也可只给 `target/english-quest.jar`（fat jar，可直接 `java -jar`） |
| `frontend/` | 前端源码；带上 `dist` 则对方不装 Node 也能部署 |
| `frontend/public/audio/listen/*.mp3` | **150 句听力音频 / 3.3MB，缺了听力关就没声音**。它不在 Git 仓库里，最容易被打包时漏掉 |
| `frontend/public/fonts/*.woff2` | Geist 字体，缺了会退化成系统字体 |
| `sql/*.sql` | 建表 + 全部初始数据（180 词 / 240 题 / 28 天语法 / 150 句听力语料） |
| `README.md` | 启动步骤与演示账号 |

**建议排除**：`frontend/node_modules/`（数百 MB，对方 `npm install` 即可）、
`.workbuddy/`（本地助手数据）。

**对方拿到后**：装 JDK 17 + MySQL 8 + Node 18 → 导入 `sql/*.sql` →
改 `application.yml` 的数据源密码 → 按上面步骤启动。全程无需联网、无需 AI Key。

> ⚠️ **压缩包会带上 `application.yml`，注意 API Key 别一起送出去。**
> 当前交付配置已是安全形态：`mock: false` + `api-key: ${AI_API_KEY:}`（文件里留空），
> 即**没填 Key 也能跑**，四项 AI 能力全部本地生成，页面上标「本地生成」。
> 谁想启用真实大模型，只需自己设环境变量 `AI_API_KEY`，**不用改代码**。
>
> **两个容易踩的坑**：
> 1. **明文 Key 会残留在构建产物里。** 若 `application.yml` 里曾经写过 `api-key: sk-xxx`，
>    那么 `backend/target/classes/application.yml` 和 **`target/english-quest.jar` 内嵌的那份
>    配置**都会保留它 —— 只改源码不重新打包，等于没改。确认方式：
>    `jar xf target/english-quest.jar BOOT-INF/classes/application.yml` 后 `grep api-key`。
> 2. **`target/` 尽量别一起打包**（fat jar 32MB，且可能夹带上一条说的旧配置）；
>    真要给 jar，就用**重新打包后**的那个。
>
> 交付前跑一次 `node scripts/ai_local_mode_check.mjs`：25 项全过 = 四项 AI 能力都在离线生成。

---

## 八、演示账号

| 角色 | 账号 | 密码 | 入口 |
| --- | --- | --- | --- |
| 学生 | `student` | 由 `APP_STUDENT_PASSWORD` 指定（默认见环境变量说明） | 登录页 |
| 管理员 | `admin` | 由 `APP_ADMIN_PASSWORD` 指定（默认见环境变量说明） | 登录页「教师 / 管理员入口」 |

---

## 九、验证脚本

```bash
# 后端主链路接口回归（47 项断言：认证/词汇/语法/游戏机制/错题/AI/看板/后台）
python scripts/smoke_test.py

# 听力听写模块接口回归（29 项断言：模式差异/判分口径/结算/错题/任务/鉴权）
python scripts/smoke_listen.py

# 前端端到端校验（18 个页面 + 键盘交互，真实 Chrome 渲染 + 真实按键派发 + 自动截图）
node scripts/e2e_check.mjs

# 语法关头部题数显示回归（讲义页 / 答题中第 1、2 题三态断言 + 截图）
node scripts/shot_grammar_count.mjs

# 语法关错题回顾回归（断言显示选项内容而非 A/B/C/D + 截图）
node scripts/shot_grammar_wrong.mjs

# 错题「针对性讲解」接口回归（21 项：讲解跟着所选错项走 / 换选项换讲解 /
# 未命中生成 → 二次命中缓存 / 选对时拒答 / 参数校验 / 两套配额可读）
# 「题号 + 错选」是**动态挑冷键**的，因此可反复执行（写死键第二遍必然误报）
node scripts/ai_explain_check.mjs

# 错题「针对性讲解」页面回归（真实浏览器：制造确定错选 → 等讲解落定 →
# 断言每条都提到所选错项、与通用解析不同、底色随主题变深 + 截图）
node scripts/shot_wrong_explain.mjs 3 dark     # 深色
node scripts/shot_wrong_explain.mjs 3 light    # 浅色

# AI 练习接口回归（19 项：配额 -1 不限次数 / 词汇多选串成短文 /
# 语法错题拓展考点 / 归属与模块校验）
node scripts/ai_extra_check.mjs

# 「无 Key 交付模式」验证（25 项）：四项 AI 能力（同型题 / 错题讲解 / 单词串烧 /
# 语法拓展）的 source 必须严格等于 MOCK —— 即命中 isMock() 短路、一次 HTTP 都没发。
# 错题讲解会先挑一个 cached=false 的冷键，确保是"本次现生成"而非历史缓存。
# 断网 / 答辩现场无网 / 打包送人前的必备体检；谁把 Key 填回去这里立刻报红
node scripts/ai_local_mode_check.mjs

# 6 项界面缺陷修复的浏览器回归（34 项）：
#   侧栏与首页横幅随主题翻转 / 横幅数值与标签居中 / 等级问号悬浮 6 级清单 /
#   AI 练习无次数限制 / 词汇多选串烧 + 语法拓展 / 个人中心「关于」底部页脚
# 「浅色还是深色」一律 clip 截真实像素取众数亮度，不读半透明的计算样式
node scripts/ui6_check.mjs

# 音频发声审计（零断言，纯诊断）：hook 掉 HTMLMediaElement.play 与
# speechSynthesis.speak，把每次调用的**调用栈**打出来，并对照两种浏览器
# 自动播放策略各跑四遍：进关卡 / 切下一句 / 手动 Ctrl+Space / 播放中退出。
# 用来回答「我没点播放，声音怎么自己出来了」这类问题
node scripts/diag_audio.mjs
node scripts/diag_audio.mjs --loose          # 只跑宽松策略

# 音频行为回归（12 项）：听力页进入与切句都不许自动播放、手动播放仍可用；
# 错题本朗读按钮读对内容（词汇=单词 / 听力=英文原句 / 语法题干抹平空位）、再点会停
node scripts/audio_check.mjs

# 首页等级进度数据自洽性（16 项）：level 与门槛表一致 /
#   cur = 总分 - 本段起点 / need = 本段所需且 cur <= need / 进度落在 0~100 /
#   未满级不出现「还差 0 分」/ rankNo 与排行榜交叉核对
node scripts/overview_check.mjs

# 首页等级进度**渲染**回归（6 项 × 浅深双主题）：不出现「182 / 118」这种分子大于分母、
#   不出现「距下一级还差 0 分」、进度条宽度真的等于 cur / need
node scripts/home_level_ui_check.mjs light
node scripts/home_level_ui_check.mjs dark

# 题库解析质量体检（量化「解析是否解释学生可能选错的干扰项」，离线跑，不连数据库服务）
python scripts/audit_analysis.py

# 动态参数路由回归（点 Day3 是否真的进 Day3，不整页刷新）
node scripts/repro_grammar_day.mjs

# 讲义渲染文本诊断（抓某天全部讲义条目 + 可疑字符扫描 + 截图）
node scripts/diag_grammar_text.mjs 3

# 界面主题回归（57 项：首屏主题 / 头像菜单 / 切深色 / 刷新持久化 /
# 跟随系统 / 深色对比度 / 逐页漏白 / ECharts 重绘 + 浅深成对截图）
node scripts/theme_check.mjs

# 深色主题「漏白」扫描（遍历所有控件，找出漏用 token 的浅色方块）
node scripts/dark_leak_scan.mjs

# 同上，但走后台账号与后台路由
EQ_USER=admin EQ_PASS=$APP_ADMIN_PASSWORD node scripts/dark_leak_scan.mjs "/admin/dashboard,/admin/users,/admin/vocab,/admin/grammar"

# 配色体检（WCAG 对比度 + 热力图色带相邻档亮度均匀度，改色前先跑）
python scripts/theme_contrast.py

# 截图像素采样（零依赖解 PNG，定量判定某张截图到底是深色还是浅色）
# 缩略图肉眼判断极不可靠，怀疑某张截图"没变深"时用它，别靠眼睛
node scripts/png_probe.mjs screenshots/36-主题-深色-首页.png 0.5,0.55 0.8,0.6
```

### 语法讲义数据修复

`sql/03_init_grammar.sql` 由 `scripts/gen_grammar_sql.py` 从上游
`grammar-quest/js/data_raw.json`（PDF 解析产物）生成。该源文件存在
**跨句拼接残段 / `U+0000` 空字符 / 个别笔误**，会一路穿透到数据库和页面。

修复用：

```bash
# 只检查，列出将要修的内容（不写文件）
python scripts/fix_grammar_data.py --check

# 执行修复：备份源数据 → 写回 → 重新生成 SQL
python scripts/fix_grammar_data.py

# 再把 SQL 重新导入数据库
mysql -h ::1 -u root -p english_quest < sql/03_init_grammar.sql
```

修复遵循**确定性替换**：精确到 `(day, point_index)` 逐条给出「原文 → 修复值」，
匹配不上就跳过告警，不做模糊批量替换，确保不误改讲义语义。

`e2e_check.mjs` 直接通过 Chrome DevTools Protocol 驱动系统 Chrome，
不依赖任何 npm 包（Node 18+ 自带 `fetch`，Node 22 自带 `WebSocket`），
运行时会用 `scripts/` 同级的 `screenshots/` 目录保存各页面截图。

它除了逐页断言文案与控制台异常外，还会用 `Input.dispatchKeyEvent` **派发真实键盘事件**，
验证「键盘能独立完成整关作答」这条主线：

- 选择题（词汇 / 语法 / AI 练习）：功能键区 `1` `2` `3` `4` 选择选项 → 自动前进 → 成绩结算
  （字母键 `A` `B` `C` `D` 保留为备选键位；数字键位于功能键区且四键相邻，
  比 `A/C` 隔排、`B/D` 跨度大的字母键更不易误按）
- 听力关：`Ctrl+Space` 重听 → 逐词敲入（简单模式**格内底衬短横提示词长**、打满自动跳格；
  困难模式**无任何长度提示**、用 `空格` 分格）→ `Enter` 提交 → 逐格红绿判分
  → `Ctrl+;` 看答案 → 纯键盘答完 10 句进入结算

两个接口测试脚本都可**反复执行**：会把「积分幂等保护」「每日上限保护」
识别为正常结果，而不是误报失败。

---

## 十、关键设计说明

### 界面设计系统：原始紫靛配色（Original Indigo）

> **状态说明**：本项目 2026-09-11 曾做过一轮 hue-wired 青绿配色改造，
> 同日按用户要求**还原为最初的紫靛配色**。当前为还原后状态：
> 颜色回到原值，而与颜色无关的结构性改动予以保留
> （Geist 自托管字体、圆角收敛、动效曲线、非对称布局、EP 主题接管）。

设计规则参考 [taste-skill](https://github.com/Leonxlnx/taste-skill)（MIT）。

| 维度 | 取值 |
| --- | --- |
| 强调色 | **紫靛 `#4f46e5`**（全站唯一强调色，不设第二强调色） |
| 中性色 | 冷调蓝灰：底板 `#f4f6f8` / 侧栏 `#14181f` / 正文 `#10151c` |
| 语义色 | 降饱和保留：成功 `#15803d` / 危险 `#b91c1c` / 警告 `#a16207`，仅用于判分反馈 |
| 字体 | Geist Variable，**本地自托管**（`frontend/public/fonts/`，46KB） |
| 圆角 | 单一体系：容器 10px / 内部 7px / 微件 5px / 药丸 full |
| 动效 | 只保留状态反馈类，统一 `cubic-bezier(0.4,0,0.2,1)` / 180ms，且响应 `prefers-reduced-motion` |

**几个刻意的决定**：

- **只有一个强调色**。第二强调色（原金）已移除 —— 两个强调色并列会互相稀释，
  谁都不再「强调」。
- **字体本地自托管**。答辩场地可能断网，不能依赖 Google Fonts。
- **Element Plus 主题被接管**。EP 自带 `#409eff` 蓝紫主题，不接管的话
  tab 下划线、分页、开关会从组件缝隙里把默认蓝漏回来。EP 的 `--el-color-*`
  变量已全部映射到紫靛体系。
- **背景不是纯色**。加了一层几乎察觉不到的冷调径向渐变与 26px 细网格，
  破除大面积纯色的「矢量稿感」。
- **卡片去掉「边框 + 阴影 + 白底」三件套**。这是最典型的模板化做法，
  现在只留一道极淡边框，需要抬升的场景才用阴影。

设计 token 集中在 `frontend/src/styles/global.css` 顶部，
改视觉只需改 token，全站自动跟随。**不要在页面里写裸色值和裸圆角。**

**例外：ECharts 图表色值必须能被解析成真实色值。**
ECharts 画的是 canvas，**不解析 CSS 变量** ——
把 `'var(--eq-primary)'` 写进配置会被当成非法颜色字符串，**静默 fallback 成黑色**。
`Stats.vue` 的 `initChart()` 已内置 `resolveCssVars()` 在运行期递归解析整个 option
（包括 `echarts.graphic.LinearGradient` 内部的 `colorStops`），
所以图表配置里可以继续写 `var(--eq-*)`，浅色/深色两套色值会自动生效。

`scripts/theme_check.mjs` 有一道专门的守卫：抽样扫描三个图表画布的像素，
**只要出现纯黑就判定色值没解析成功**（两个主题都扫）。

图表配色约定（`Stats.vue`）：

- 热力图色带走 token `--eq-heat-0…5` + 空档 `--eq-heat-empty`：
  浅色是「浅 → 深」、深色是「暗 → 亮」，方向相反。
  相邻档位相对亮度比控制在 1.25-1.66x，**末档用强调色而非近黑**
- 柱体/折线填充用**实心强调色**，不要用 `--eq-primary-line`
  （那是半透明边框色，做填充会整片发灰）
- 改色前先跑 `python scripts/theme_contrast.py` 体检亮度阶梯，
  不要凭感觉挑色

**保留的结构性改进**（与配色无关）：

- 首页 hero 为非对称双栏（左侧等级进度 / 右侧数据点用细竖线分隔，不做成三张并排卡片）
- 首页入口卡为 `1.25fr / 1fr` 非对称网格，主线卡用强调色底区分层级
- 答题页题面 30px/600 为单一视觉主角，选项键帽为真实键帽造型
- 侧栏当前项为「轻底色 + 左侧竖条」而非整块渐变填充

### 界面主题：浅色 / 深色 / 跟随系统

入口在**侧边栏底部的头像**上 —— 点头像弹出账号菜单，菜单底部「偏好设置 → 主题」
是一个三态分段控件（跟随系统 / 浅色 / 深色）。

**为什么是三态而不是开关**：开关只能表达两个状态，而「跟随系统」和
「此刻恰好是深色」是两回事。用户选了跟随系统后，白天用浅色、晚上系统转深色时
应用要能自动跟上，不能被锁死在某个值上。

| 组成 | 位置 | 职责 |
| --- | --- | --- |
| 主题状态 | `src/store/theme.js` | 决定主题名（`system`/`light`/`dark`）、持久化、监听系统变化 |
| 首屏防白闪 | `index.html` 内联脚本 | 打包产物加载**之前**就把 `data-theme` 写到 `<html>` |
| 配色覆盖 | `styles/global.css` 的「深色主题」章节 | 唯一的换肤实现：覆盖一整套 CSS 变量 |
| ECharts | `Stats.vue` | 主题变化时 dispose + 重建图表（canvas 不会自己重绘） |

换肤**完全靠 CSS 变量覆盖**，组件样式一行都不用改：
`<html data-theme="dark">` 上的变量覆盖会自动向下继承。

**没有引入 Element Plus 官方的深色样式包**。原因是本项目已经用
`:root { --el-color-primary: … }` 接管了 EP 主题，而官方深色包的 `html.dark`
选择器**特异性更高**，会反过来把紫靛强调色冲成 EP 默认蓝。
所以 EP 的深色变量也在 `global.css` 里自己映射了一遍。

深色主题的三条硬规则：

1. **层级靠明度差**，不靠描边：侧栏最暗 < 页底 < 卡片 < 悬浮控件
2. **强调色拆成两个 token**：`--eq-primary` 仍是填充色（要够深才压得住白字），
   `--eq-accent` 是文字形态（深色下必须变亮，否则 `#4338ca` 落在 `#161b23` 上只有 2.8:1）
3. **阴影改用纯黑 + 大透明度**：深色底上带色相的阴影等于没有阴影

容易被漏掉、已经在 `global.css` 里统一处理的位置（都是"不写 hex 变量"的地方）：

- EP 的 `--el-color-*-light-3/5/7/8/9` 阶梯。它被 `el-tag` / `el-alert` /
  plain 按钮当作背景色用，浅色下接近白色 → 深色下每个 tag 都会变成一块白斑
- EP 禁用态按钮的 `--el-button-disabled-*`。它定义在 `.el-button--info` 这类
  **按钮元素自身**上，只在 `:root` 覆盖不生效，必须直接命中按钮类
- `color-scheme`。不设的话深色页上会挂一条惨白的滚动条
- ECharts 图表色带与面积渐变（canvas 不做级联，必须显式重绘）

### 动态参数路由：参数一律用 computed 取

本项目有三条动态参数路由：`/lesson/:day`、`/quiz/:levelId`、`/listen/:levelId/:mode`。

`<router-view>` **没有加 `:key`**，因此同一路由记录只换参数时（例如
`/lesson/2` → `/lesson/3`），Vue Router 会**复用组件实例、`setup()` 不再执行**。
若在 setup 里用普通常量取参数快照：

```js
// ✗ 错误：切天时永远停在旧值，页面继续渲染上一天的数据
const day = Number(route.params.day)

// ✓ 正确：参数变化时 computed 会重新求值
const day = computed(() => Number(route.params.day))
```

**规则**：路由参数一律 `computed`；参数变化需要重新取数时补 `watch`，
并在 watch 里调用加载函数。相应地，跳转函数**只负责 `router.replace()`**，
不要再手动调一次 `load()`（否则重复请求）。

已按此模式改过的页面：`GrammarLesson.vue`（`day`）、`VocabQuiz.vue`（`levelId`）、
`ListenPractice.vue`（`levelId` / `mode` / `isHard`）。
回归验证脚本：`scripts/repro_grammar_day.mjs`。

### 积分引擎（防刷分）

- 每笔积分写入 `t_point_log` 时携带业务唯一键 `biz_id`，表上有唯一约束 `uk_user_type_biz`，
  同一业务动作重复提交不会重复发分。
- 每日总积分上限 200 分，其中答题类（`ANSWER`）上限 100 分。
- 等级阈值：0 / 100 / 300 / 600 / 1000 / 2000，对应
  「英语学徒 / 单词猎人 / 语法游侠 / 闯关达人 / 学霸精英 / 专升本王者」。

### 关卡解锁

- 词汇关：需通过上一关（`prevPassed` 判定）。
- 语法关：第 1 天默认解锁，第 N 天需第 N-1 天成绩 ≥ 及格分（60）。

### 答题页头部的题数指示（全站统一）

词汇关、语法关、听力关共用 `.quiz-bar` 结构，右侧题数指示按状态切换口径：

| 状态 | 显示 | 说明 |
| --- | --- | --- |
| 开始前 | `10 题` | 看的是"这关有多少题"，总数才有意义 |
| 答题中 | `3 / 10` | 进度语义，能直观看出还剩几题 |
| 结算后 | 隐藏 | 结算卡里已有 `3/3 答对`，头部再显示即重复 |

**只写总题数是不够的** —— 答题过程中数字恒定不动，用户既不知道当前第几题，
也不知道还剩几题。新增同类答题页时请沿用此约定。

题数取值**以实际下发的题目数组为准**（`questions.length`），
后端字段（如语法关的 `lesson.questionCount`）只作兜底：
两者若不一致，头部会与底部进度条、结算页数字对不上。

### 错题回顾：必须显示选项内容，不显示 A/B/C/D

**规则**：任何"让用户复盘自己做错了什么"的界面，都要展示**语义内容**而非标识符。

结算接口返回的 `userAnswer` / `correctAnswer` 是选项 **key**（`A`/`B`/`C`/`D`），
单独呈现毫无意义 —— 用户记不住"A 是哪个选项"，也无法和正确答案对照。
因此 `SubmitResultVO.WrongItem` 额外下发：

| 字段 | 含义 |
| --- | --- |
| `userAnswer` / `correctAnswer` | 选项 key，保留给需要按 key 做逻辑的地方 |
| `userAnswerText` / `correctAnswerText` | 选项**完整文本**，如 `women teachers` / `the, /` |

后端由 `GrammarService.optionText(q, key)` 翻译，前端 `answerText(text, key)`
**文本优先、key 降级兜底**，未作答显示「未作答」（不留空白行）。

已在**语法关**落地；词汇关与 AI 练习的错题回顾尚未改（后续工作）。

### 错题针对性讲解：跟着「你实际选的那一项」走

**规则**：错题讲解必须针对**学生实际选中的那个错项**展开，不能只讲正确答案。

同一道题选 B 和选 C 是两种不同的错法，用同一段通用解析等于没讲。
但题库里每题只有**一段静态 `analysis`**（`t_grammar_question.analysis` /
`t_vocab_question.analysis`），它只论证正确答案。量化体检（`scripts/audit_analysis.py`）结果：

| 模块 | 题量 | 解析提及任一干扰项 | 覆盖学生实际错选的概率 |
| --- | --- | --- | --- |
| 词汇 | 240 | 0% | ≈0% |
| 语法 | 84 | 18% | ≈6% |

因此新增 `POST /api/ai/wrong-explain`，按 `(module, question_id, chosen)` 三元组生成讲解：

| 环节 | 做法 |
| --- | --- |
| 先查缓存 | 命中 `t_wrong_explain` 直接返回（讲解内容非个人数据，**同一错法可全站复用**） |
| 未命中 | 走 `LlmClient` 实时生成；无 key / 调用失败时降级为本地规则生成（`localExplain`），**不报错、不空窗** |
| 独立配额 | `app.ai.explain-daily-limit`（默认 60），与 AI 出题的每日上限**分开计**，互不挤占 |
| 落库 | 成功后写入 `t_wrong_explain`（`uk_module_question_chosen` 唯一键，并发冲突时回查已有行） |

生成内容始终包含三件事：**你选的是哪一项（含选项文本）→ 本题的判定依据 → 正确答案是什么**，
并附一句针对性的区分提示（形近词 / 词性 / 默认兜底）。

前端在 `GrammarLesson.vue` 的每条错题下方渲染 `.explain-box`（左侧强调色竖条 + 淡强调底，
与下方通用解析在视觉上分层）。讲解是**异步补位**渲染的：结算分数立刻出，
讲解逐条填进来，期间显示「正在针对你选的选项生成讲解…」，失败则静默降级、
下方通用解析仍然兜底（接口调用标记 `silent: true`，不弹错误提示）。

> 为什么选「运行时实时调模型」而不是「提前批量生成入库」：
> 错选组合是 `题数 × 选项数` 的量级，离线全量生成既慢又大量冗余；
> 而真实错选是稀疏的，配一层缓存后实际调用量很小。
> 选「先做语法关」是因为语法题的干扰项设计更有规律（词性 / 形近词），
> 讲解话术更容易验证到位，跑通后再推广到词汇关。

已在**语法关**落地并验证；词汇关 / 错题本 / AI 练习的推广为后续工作。

### 判分口径

- 选择题：选项字母精确匹配。
- 拼写题：`trim` 后忽略大小写比较。
- 每题 10 分（10 题制），满分 100，星级 100→3 星 / ≥80→2 星 / ≥60→1 星。

### 听力听写：两种难度模式与反作弊设计

| | 简单模式 | 困难模式 |
| --- | --- | --- |
| 输入格 | 按词预先分好 N 个格子，格宽 = 词长 × 11.5 + 26px | 起始只有 1 个格子，敲一个词按 `空格` 长出一个，宽度只随自己的输入变化 |
| 跳格方式 | 打满一格自动跳到下一格（全程不用按空格） | 只能按 `空格` 分格 |
| 接口下发 | `chinese` + `wordCount` + `wordLens` | **只有** `chinese` |
| 答对一句 | +2 分 | +3 分 |

**为什么困难模式连「有几个格子」都不给**：一进页面就摆出 5 个空格子，
等于直接告诉用户「这句 5 个词」，困难模式就名存实亡了。所以困难模式只给一个空格子，
词数由用户自己听出来、按空格分出来；格子宽度也只随用户已敲入的字符变化，不携带任何原文信息。

输入格与后端词长提示同口径：格宽用 `normalize` 后的词长计算，
所以 `don't`（原文 5 字符 / 归一化后 4 字符）不会被误判成「已打满」而提前跳格。

**为什么困难模式连 `wordCount` 都不下发**：练习阶段接口只返回句子 ID 与中文译文，
英文原句和长度信息全部留在服务端。答案无法从网络响应或 DOM 推断，
「无提示」是真的无提示，而不是靠前端把元素藏起来。

**逐词判分用 LCS（最长公共子序列）而不是按下标硬比**：
听写时漏掉一个词非常常见，按下标比对会导致「漏一个词 → 后面全判错」，
反馈极其打击人。用 LCS 后漏词只影响那一个词，得分与逐词红绿着色都能如实反映水平。

判分口径：

- 归一化：转小写 → 去掉撇号（`don't` 与 `dont` 等价）→ 标点转空格 → 压缩多余空白
- 准确率 = 匹配词数 ÷ 正确答案词数
- **完全正确**要求逐词全对且没有多敲的词（多打字判为不正确）
- 单句得分 = `round(准确率 × 10)`；整关得分 = 平均准确率 × 100
- 按 `Ctrl+;` 查看答案即视为放弃本题，提交时 `revealed=true`，该题按 0 分计

**错题本联动**：听错的句子以 `module='LISTENING'` 收录，
`stem` 存中文、`correctAnswer` 存英文原句，在错题本里可点击朗读重听；
重练判定走词级准确率（≥80% 算通过），而不是整句严格相等。

**播放在手里，不在页面手里：进关卡和切下一句都不自动出声。**

`goTo()` 末尾曾经无条件调 `play()`，于是「一进关卡就响」「按 Enter 切下一句又响」，
连「已听 N 次」都被自动播放带着 +1，学情数据跟着虚高。
更麻烦的是它还要看浏览器脸色：本次会话没交互过时，`play()` 会被自动播放策略拒掉
（`NotAllowedError`），而页面弹的却是「音频加载失败，请运行 gen_listen_audio.py」——
音频明明是好的，照着提示排查只会白忙。

现在只有「播放发音」按钮与 `Ctrl+Space` 会触发播放（`play()` 只剩这两个调用点），
并且把「被浏览器拦住」和「文件真的缺失」分成两条提示。
验证方式是把 `HTMLMediaElement.play` hook 掉看**调用栈**：
`scripts/diag_audio.mjs` 会告诉你每一次播到底是谁发起的。

**积分口径**：答对一句按模式给分（简单 +2 / 困难 +3），通过关卡 +10，满分 +20；
同一关卡同一天只结算一次答题积分（`biz_id` 幂等）。

### 讲义数据格式

`t_grammar_lesson.content` 存储 JSON 数组：

```json
[{ "text": "知识点正文", "example": "例句（可为 null）" }]
```

后端解析带容错：JSON 非法时降级为按行纯文本展示，不会让接口报 500。

### AI 出题降级策略

判定入口只有一个：`LlmClient.isMock() = mock || apiKey 为空`。

- **key 为空** → 无论 `mock` 怎么配，都直接走本地生成（`source=MOCK`），**压根不发网络请求**；
- `mock=true` → 同样强制本地生成（演示时用来杜绝意外真实调用）；
- key 有效且 `mock=false` → 走 OpenAI 兼容协议的真实大模型（`source=LLM`）；
- 真调用抛异常（断网 / key 失效 / 超时）→ 降级为本地生成（`source=FALLBACK`）并记入 `t_ai_call_log`。

**三个能力都有「LLM / MOCK / FALLBACK」三态**，`source` 字段如实标注，
页面会显示「AI 生成」还是「本地生成」：

| source | 触发条件 | 内容来源 |
| --- | --- | --- |
| `LLM` | `mock=false` 且 key 有效，调用成功 | DeepSeek 实时生成 |
| `MOCK` | **key 为空**（无论 `mock` 取值），或 `mock=true` | 纯本地代码生成（`localExplain` / `localPassage` / `localExpand`） |
| `FALLBACK` | key 有效但**调用抛异常**（断网 / key 失效 / 超时） | 同上，本地生成 |

> **怎么证明"没联网"**：`MOCK` 与 `FALLBACK` 都产出可用内容，但含义完全不同 ——
> `MOCK` 是命中了 `isMock()` 短路分支、**一次 HTTP 都没发**；`FALLBACK` 是发出去失败了才降级。
> 判断交付版本是否真的离线，看 `source` 是不是 **`MOCK`**。
> `node scripts/ai_local_mode_check.mjs` 就是干这件事的（25 项，对 `source` 断言严格等于 `MOCK`）。

**本地生成不依赖任何外部服务**：不用联网、不用 key、不读外部文件，
只依赖数据库里的题目数据 —— 所以**离线环境、答辩断网都照常可用**，
内容真实可用而非占位符。这是打包交付时最省心的一条路径。

### DeepSeek API Key 填在哪里

配置文件：`backend/src/main/resources/application.yml` → `app.ai` 段。两种填法：

```yaml
app:
  ai:
    mock: false                                   # 保持 false 即可；key 为空时自动走本地生成
    base-url: https://api.deepseek.com/v1/chat/completions
    api-key: ${AI_API_KEY:}                       # ← 方式一：读环境变量（推荐，不改代码）
    # api-key: sk-xxxxxxxx                        # ← 方式二：直接写在这里
    model: deepseek-chat
```

方式一在 Windows 下设置环境变量后重启后端即可：命令行 `set AI_API_KEY=sk-xxx`（临时），
或「系统属性 → 环境变量」新建 `AI_API_KEY`（永久）。

**没填 Key 也不会白屏**：`LlmClient.isMock()` 在 key 为空时自动返回 true，
三个 AI 能力（同型题 / 错题讲解 / 单词串烧 + 语法拓展）全部退化为本地生成，
内容真实可用，不是占位符；页面上会标注「本地生成」。接上 Key 后自动切换为真实模型。

### AI 练习不设次数上限

`app.ai.daily-limit` 与 `app.ai.explain-daily-limit` 均配置为 `0`，约定 **`<= 0` 表示不限次数**：
`AiService.isUnlimited(limit)` 在限流判断处短路，`/api/ai/quota` 相应返回 `-1`。
保留字段而不是删掉，是为了兼容既有冒烟测试与前端读取逻辑（字段名不动，语义扩展）。

### 单词串烧与语法拓展

| 能力 | 接口 | 关键约束 |
|---|---|---|
| 词汇错题多选 → 短文 | `POST /api/ai/passage` `{ errorIds: [...] }` | 2~12 个；必须都属于本人且 `module = VOCAB`；返回的 `words` 逐个校验出现在正文中 |
| 语法错题 → 考点拓展 | `POST /api/ai/expand` `{ errorId }` | 必须属于本人且 `module = GRAMMAR`；拓展围绕 `knowledgePoint` 展开 |

两者同样遵循「Mock / LLM / FALLBACK」三态。本地范文刻意把单词放进**不依赖词性**的通用框架句
（`I met "horse" first, …`），否则无法保证本地稿语法正确 —— 真要让单词自然融入情节仍需大模型。

### 错题本有三个模块，界面不要用二元判断

`t_error_book.module` 有 `VOCAB` / `GRAMMAR` / `LISTENING` 三种值。
AI 练习页早期写成 `module === 'VOCAB' ? '词汇' : '语法'`，
结果**把听力错题也标成了「语法」**，用户点进去点不出任何有效动作。
现在改为按模块查表（`MODULE_META`），并且 AI 练习只收词汇/语法 ——
对听力错题它本来就没有对应的生成能力，列出来只会误导。

**同一个写法在错题本页还有一份**（`{{ module === 'VOCAB' ? '词汇' : '语法' }}`），
而错题本恰恰是三模块混排的页面，于是 40 张听力卡全被标成「语法」。
改法是直接用它自己 script 里那两个一直没人调用的函数
（`moduleLabel` / `moduleClass`）—— 听力现在显示绿色「听力」标签。
教训：**同一个二元判断会散落在多个页面，改一处不等于改完。**

### 错题本朗读按钮：按模块决定「读什么」

错题记录里的字段并不都适合朗读，所以要按模块挑：

| 模块 | 读什么 | 为什么不用别的 |
| --- | --- | --- |
| 词汇 | `knowledgePoint` | 它就是那个单词；而 `stem` 是 `principle（原则；原理）`，直接读会把中文释义也念进去 |
| 听力 | `correctAnswer` | 英文原句；而 `stem` 是中文译文 |
| 语法 | `stem` 抹掉 `______` | 题干本身是英文句子，但空位是下划线，不抹平会念出怪音 |

语音走浏览器内置的 Web Speech API（`composables/useSpeech.js`），零依赖、离线可用。
`speak()` 为了绕开「cancel 后立即 speak 会静默失败」而延迟 30ms 再发声，
所以卸载时必须把这条**排队**一起作废 —— 否则组件都销毁了它照样念出来。
