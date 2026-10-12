#!/usr/bin/env bash
# 打包 english-quest
#   用法1（只打后端 jar）： bash scripts/build_backend.sh
#   用法2（全量交付包）  ： bash scripts/build_backend.sh --full
#       会额外跑前端 npm run build，并把 jar + dist + sql + 说明收进 release/ 目录
set -u

MAVEN_HOME_WIN="E:/Chrome/apache-maven-3.9.11-bin/apache-maven-3.9.11"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
JAR="$BACKEND_DIR/target/english-quest.jar"

FULL=0
[ "${1:-}" = "--full" ] && FULL=1

echo "== 1/4 预检查：端口占用提示 =="
running_pid="$(netstat -ano 2>/dev/null | awk '/:8090[ \t]/ && /LISTENING/ {print $NF; exit}')"
if [ -n "${running_pid:-}" ]; then
  echo "  [注意] 8090 上有后端在跑（PID $running_pid）。打包本身通常能成功（JDK 以 FILE_SHARE_DELETE 打开 jar），"
  echo "         但那个进程读的是启动时的旧配置 —— **不重启，新配置不会生效**。"
  echo "         若打包报 'Unable to rename ...jar.original'，说明确实被占用，先停掉再打包。"
  echo "         停机前务必核对命令行再执行： MSYS_NO_PATHCONV=1 taskkill /PID $running_pid /T /F"
else
  echo "  [OK] 8090 空闲"
fi

echo "== 2/4 mvn package -DskipTests =="
cd "$BACKEND_DIR" || exit 1
java -classpath "$MAVEN_HOME_WIN/boot/plexus-classworlds-2.9.0.jar" \
     -Dclassworlds.conf="$MAVEN_HOME_WIN/bin/m2.conf" \
     -Dmaven.home="$MAVEN_HOME_WIN" \
     -Dmaven.multiModuleProjectDirectory="$(cygpath -w "$BACKEND_DIR" 2>/dev/null || echo "$BACKEND_DIR")" \
     org.codehaus.plexus.classworlds.launcher.Launcher package -DskipTests
rc=$?
[ $rc -ne 0 ] && { echo "  [!!] 打包失败，退出码 $rc"; exit $rc; }

echo "== 3/4 产物 =="
ls -la "$JAR" || { echo "  [!!] 没找到 $JAR"; exit 1; }

echo "== 4/4 核验 jar 内嵌 AI 配置（这才是运行时真正读到的值）=="
tmp="$BACKEND_DIR/_tmp_jarchk"
rm -rf "$tmp"; mkdir -p "$tmp"
if ( cd "$tmp" && jar xf ../target/english-quest.jar BOOT-INF/classes/application.yml ); then
  grep -nE '^\s*(mock|api-key|base-url|model|daily-limit|explain-daily-limit):' \
       "$tmp/BOOT-INF/classes/application.yml"
else
  echo "  [!!] 解包失败，跳过核验"
fi
rm -rf "$tmp"

# ============ 全量交付包 ============
if [ "$FULL" = "1" ]; then
  echo "== 5/6 前端打包 npm run build =="
  cd "$FRONTEND_DIR" || exit 1
  npm run build || { echo "  [!!] 前端打包失败"; exit 1; }
  [ -f "$FRONTEND_DIR/dist/index.html" ] || { echo "  [!!] dist/index.html 不存在"; exit 1; }
  echo "  [OK] dist 产物：$(ls "$FRONTEND_DIR/dist" | tr '\n' ' ')"
  # 听力 mp3 是交付硬要求，单独点一下数量
  n=$(ls "$FRONTEND_DIR/dist/audio/listen"/*.mp3 2>/dev/null | wc -l)
  echo "  [OK] dist/audio/listen/*.mp3 共 $n 个（期望 150）"

  echo "== 6/6 收集交付目录 release/ =="
  REL="$ROOT_DIR/release"
  rm -rf "$REL"
  mkdir -p "$REL/backend" "$REL/frontend" "$REL/sql"
  cp "$JAR" "$REL/backend/english-quest.jar"
  cp -r "$FRONTEND_DIR/dist/." "$REL/frontend/"
  cp "$ROOT_DIR/sql"/*.sql "$REL/sql/"
  cp "$ROOT_DIR/前后端运行命令.txt" "$REL/" 2>/dev/null
  cat > "$REL/交付说明.txt" <<'EOT'
english-quest 游戏化专升本英语闯关学习系统 —— 交付包

目录结构
  backend/english-quest.jar   后端服务（Spring Boot，内嵌 Tomcat）
  frontend/                   前端静态文件（Vue3 构建产物，含音频与字体）
  sql/                        数据库脚本，按编号顺序执行

部署步骤
  1. 建库并导入数据（MySQL 8）：
       mysql -u root -p -e "CREATE DATABASE english_quest DEFAULT CHARSET utf8mb4;"
       mysql -u root -p english_quest < sql/01_schema.sql
       mysql -u root -p english_quest < sql/02_init_vocab.sql
       mysql -u root -p english_quest < sql/03_init_grammar.sql
       mysql -u root -p english_quest < sql/04_init_task.sql
       mysql -u root -p english_quest < sql/05_init_listen.sql
       mysql -u root -p english_quest < sql/06_wrong_explain.sql

  2. 启动后端（默认 8090）：
       java -jar backend/english-quest.jar

  3. 打开前端：
       方式A：把 frontend/ 整个目录交给 Nginx 等静态服务器托管
       方式B：本地起个静态服务，例如  npx serve frontend

默认账号
  学生： student / $APP_STUDENT_PASSWORD
  管理员：admin   / $APP_ADMIN_PASSWORD

关于 AI 能力
  本项目 AI 讲解/生成能力为「本地离线生成」（source=MOCK），断网可正常运行，
  不依赖任何外部 API 密钥。

数据库连接如需修改，请改 application.yml 后重新打包：
  bash scripts/build_backend.sh
EOT
  echo "  [OK] 交付目录：$REL"
  du -sh "$REL" 2>/dev/null || true
  echo
fi

cat <<'EOT'

提示：
  1) api-key 为 ${AI_API_KEY:} 时：设了同名环境变量 -> 调远端 DeepSeek；
     没设 -> 为空 -> 自动退化为本地 MOCK 离线生成（不联网、不报错）。
  2) 习惯用 set AI_API_KEY=sk-xxx 的话，注意 set 只在当前窗口生效；
     写死进 yml 的那一行会被烤进 jar，交付时等于泄露，务必改回 ${AI_API_KEY:}。
  3) 重启后端（注意宿主会注入 SERVER__PORT，必须显式抹掉）：
     env -u SERVER__PORT -u SERVER_PORT -u SERVER_PORT_0 java -jar backend/target/english-quest.jar
  4) 只改了前端代码的话，这个脚本没用，要跑 npm run build（frontend/dist 不会自动更新）。
EOT
