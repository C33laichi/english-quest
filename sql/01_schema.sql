-- ============================================================
-- 基于游戏化机制的专升本英语闯关学习系统 —— 数据库结构脚本
-- MySQL 8.0 / utf8mb4
-- ============================================================
CREATE DATABASE IF NOT EXISTS english_quest DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE english_quest;

-- ------------------------------------------------------------
-- 1. 用户表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS t_user;
CREATE TABLE t_user (
  id              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  username        VARCHAR(50)  NOT NULL                COMMENT '用户名',
  password        VARCHAR(100) NOT NULL                COMMENT 'BCrypt 加密后的密码',
  nickname        VARCHAR(50)           DEFAULT NULL   COMMENT '昵称',
  role            VARCHAR(20)  NOT NULL DEFAULT 'STUDENT' COMMENT '角色：STUDENT / ADMIN',
  avatar          VARCHAR(255)          DEFAULT NULL   COMMENT '头像地址',
  total_points    INT          NOT NULL DEFAULT 0      COMMENT '累计积分',
  streak_days     INT          NOT NULL DEFAULT 0      COMMENT '连续打卡天数',
  last_study_date DATE                  DEFAULT NULL   COMMENT '最近学习日期',
  status          TINYINT      NOT NULL DEFAULT 1      COMMENT '状态：1 正常 0 禁用',
  create_time     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_username (username),
  KEY idx_points (total_points)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- ------------------------------------------------------------
-- 2. 词汇关卡表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS t_vocab_level;
CREATE TABLE t_vocab_level (
  id             BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  name           VARCHAR(50) NOT NULL                COMMENT '关卡名称',
  difficulty     VARCHAR(20) NOT NULL DEFAULT 'BASIC' COMMENT '难度：BASIC / INTERMEDIATE / ADVANCED',
  description    VARCHAR(255)         DEFAULT NULL   COMMENT '关卡描述',
  question_count INT         NOT NULL DEFAULT 10     COMMENT '每次闯关抽题数',
  pass_score     INT         NOT NULL DEFAULT 60     COMMENT '及格分',
  sort_no        INT         NOT NULL DEFAULT 0      COMMENT '排序号',
  status         TINYINT     NOT NULL DEFAULT 1      COMMENT '状态：1 启用 0 停用',
  create_time    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_sort (sort_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='词汇关卡表';

-- ------------------------------------------------------------
-- 3. 词汇题目表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS t_vocab_question;
CREATE TABLE t_vocab_question (
  id          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  level_id    BIGINT       NOT NULL                COMMENT '所属关卡',
  type        VARCHAR(20)  NOT NULL DEFAULT 'CHOICE' COMMENT '题型：CHOICE 英译中选择题 / SPELL 中译英拼写题',
  word        VARCHAR(64)  NOT NULL                COMMENT '单词',
  phonetic    VARCHAR(64)           DEFAULT NULL   COMMENT '音标',
  meaning     VARCHAR(255) NOT NULL                COMMENT '中文释义',
  option_a    VARCHAR(255)          DEFAULT NULL   COMMENT '选项A',
  option_b    VARCHAR(255)          DEFAULT NULL   COMMENT '选项B',
  option_c    VARCHAR(255)          DEFAULT NULL   COMMENT '选项C',
  option_d    VARCHAR(255)          DEFAULT NULL   COMMENT '选项D',
  answer      VARCHAR(64)  NOT NULL                COMMENT '正确答案',
  analysis    VARCHAR(500)          DEFAULT NULL   COMMENT '解析',
  status      TINYINT      NOT NULL DEFAULT 1      COMMENT '状态：1 启用 0 停用',
  create_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_level (level_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='词汇题目表';

-- ------------------------------------------------------------
-- 4. 语法每日关卡表（28 天语法体系）
-- ------------------------------------------------------------
DROP TABLE IF EXISTS t_grammar_lesson;
CREATE TABLE t_grammar_lesson (
  id             BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  day_no         INT          NOT NULL                COMMENT '第几天（1~28）',
  title          VARCHAR(100) NOT NULL                COMMENT '当日主题',
  stage          VARCHAR(60)           DEFAULT NULL   COMMENT '所属阶段',
  mode           VARCHAR(20)  NOT NULL DEFAULT '学习' COMMENT '模式：学习 / 复习 / 自测',
  content        MEDIUMTEXT                            COMMENT '讲义内容（JSON 数组，含知识点与例句）',
  question_count INT          NOT NULL DEFAULT 3      COMMENT '测验题量',
  pass_score     INT          NOT NULL DEFAULT 60     COMMENT '及格分',
  create_time    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_day (day_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='语法每日关卡表';

-- ------------------------------------------------------------
-- 5. 语法题目表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS t_grammar_question;
CREATE TABLE t_grammar_question (
  id              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  lesson_id       BIGINT       NOT NULL                COMMENT '所属每日关卡',
  type            VARCHAR(20)  NOT NULL DEFAULT 'CHOICE' COMMENT '题型：CHOICE / FILL',
  stem            VARCHAR(500) NOT NULL                COMMENT '题干',
  option_a        VARCHAR(255)          DEFAULT NULL   COMMENT '选项A',
  option_b        VARCHAR(255)          DEFAULT NULL   COMMENT '选项B',
  option_c        VARCHAR(255)          DEFAULT NULL   COMMENT '选项C',
  option_d        VARCHAR(255)          DEFAULT NULL   COMMENT '选项D',
  answer          VARCHAR(64)  NOT NULL                COMMENT '正确答案',
  analysis        VARCHAR(500)          DEFAULT NULL   COMMENT '解析',
  knowledge_point VARCHAR(100)          DEFAULT NULL   COMMENT '知识点标签',
  status          TINYINT      NOT NULL DEFAULT 1      COMMENT '状态：1 启用 0 停用',
  create_time     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_lesson (lesson_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='语法题目表';

-- ------------------------------------------------------------
-- 6. 答题记录表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS t_study_record;
CREATE TABLE t_study_record (
  id             BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  user_id        BIGINT      NOT NULL                COMMENT '用户ID',
  module         VARCHAR(20) NOT NULL                COMMENT '模块：VOCAB / GRAMMAR / AI',
  target_id      BIGINT               DEFAULT NULL   COMMENT '关卡ID（lesson/level）',
  question_id    BIGINT      NOT NULL                COMMENT '题目ID',
  user_answer    VARCHAR(255)         DEFAULT NULL   COMMENT '用户答案',
  correct_answer VARCHAR(255)         DEFAULT NULL   COMMENT '正确答案',
  is_correct     TINYINT     NOT NULL DEFAULT 0      COMMENT '是否正确：1 是 0 否',
  cost_time      INT                  DEFAULT NULL   COMMENT '答题耗时（秒）',
  create_time    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '答题时间',
  PRIMARY KEY (id),
  KEY idx_user_time (user_id, create_time),
  KEY idx_user_module (user_id, module)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='答题记录表';

-- ------------------------------------------------------------
-- 7. 用户关卡进度表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS t_user_lesson;
CREATE TABLE t_user_lesson (
  id          BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  user_id     BIGINT      NOT NULL                COMMENT '用户ID',
  lesson_id   BIGINT      NOT NULL                COMMENT '关卡ID',
  module      VARCHAR(20) NOT NULL                COMMENT '模块：VOCAB / GRAMMAR / LISTENING',
  day_no      INT                  DEFAULT NULL   COMMENT '语法天数（词汇与听力关卡为 NULL）',
  score       INT         NOT NULL DEFAULT 0      COMMENT '最高成绩',
  pass_score  INT         NOT NULL DEFAULT 60     COMMENT '及格分快照',
  stars       TINYINT     NOT NULL DEFAULT 0      COMMENT '星级 0~3',
  correct_cnt INT         NOT NULL DEFAULT 0      COMMENT '正确题数',
  total_cnt   INT         NOT NULL DEFAULT 0      COMMENT '总题数',
  status      VARCHAR(20) NOT NULL DEFAULT 'UNLOCKED' COMMENT '状态：UNLOCKED / PASSED / MASTERED',
  finish_time DATETIME             DEFAULT NULL   COMMENT '完成时间',
  create_time DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_lesson (user_id, module, lesson_id),
  KEY idx_user_day (user_id, day_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户关卡进度表';

-- ------------------------------------------------------------
-- 8. 错题本表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS t_error_book;
CREATE TABLE t_error_book (
  id              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  user_id         BIGINT       NOT NULL                COMMENT '用户ID',
  module          VARCHAR(20)  NOT NULL                COMMENT '模块：VOCAB / GRAMMAR',
  question_id     BIGINT       NOT NULL                COMMENT '题目ID',
  knowledge_point VARCHAR(100)          DEFAULT NULL   COMMENT '知识点标签',
  stem            VARCHAR(500) NOT NULL                COMMENT '题目内容（题干或单词）',
  correct_answer  VARCHAR(255) NOT NULL                COMMENT '正确答案',
  wrong_answer    VARCHAR(255)          DEFAULT NULL   COMMENT '用户错误答案',
  analysis        VARCHAR(500)          DEFAULT NULL   COMMENT '解析',
  wrong_times     INT          NOT NULL DEFAULT 1      COMMENT '错误次数',
  status          TINYINT      NOT NULL DEFAULT 0      COMMENT '掌握状态：0 未掌握 1 已掌握',
  create_time     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '收录时间',
  update_time     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_question (user_id, module, question_id),
  KEY idx_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='错题本表';

-- ------------------------------------------------------------
-- 9. 积分流水表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS t_point_log;
CREATE TABLE t_point_log (
  id            BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  user_id       BIGINT      NOT NULL                COMMENT '用户ID',
  change_points INT         NOT NULL                COMMENT '积分变动（可为负）',
  type          VARCHAR(30) NOT NULL                COMMENT '类型：ANSWER/LEVEL/FULL_SCORE/LOGIN/CHECKIN/TASK',
  biz_id        VARCHAR(64) NOT NULL                COMMENT '业务唯一标识（防重复发放）',
  remark        VARCHAR(100)         DEFAULT NULL   COMMENT '备注',
  create_time   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_type_biz (user_id, type, biz_id),
  KEY idx_user_time (user_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分流水表';

-- ------------------------------------------------------------
-- 10. AI 调用日志表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS t_ai_call_log;
CREATE TABLE t_ai_call_log (
  id              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  user_id         BIGINT       NOT NULL                COMMENT '用户ID',
  error_id        BIGINT                DEFAULT NULL   COMMENT '来源错题ID',
  knowledge_point VARCHAR(100)          DEFAULT NULL   COMMENT '知识点',
  success         TINYINT      NOT NULL DEFAULT 1      COMMENT '是否成功',
  cost_ms         INT          NOT NULL DEFAULT 0      COMMENT '耗时（毫秒）',
  create_time     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '时间',
  PRIMARY KEY (id),
  KEY idx_user_time (user_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 调用日志表';

-- ------------------------------------------------------------
-- 11. 每日任务定义表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS t_daily_task;
CREATE TABLE t_daily_task (
  id            BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  code          VARCHAR(40) NOT NULL                COMMENT '任务编码',
  title         VARCHAR(100) NOT NULL               COMMENT '任务标题',
  task_type     VARCHAR(30) NOT NULL                COMMENT '类型：LEVEL_COUNT / CORRECT_COUNT / AI_COUNT',
  target_value  INT         NOT NULL DEFAULT 1      COMMENT '目标值',
  reward_points INT         NOT NULL DEFAULT 10     COMMENT '奖励积分',
  sort_no       INT         NOT NULL DEFAULT 0      COMMENT '排序',
  status        TINYINT     NOT NULL DEFAULT 1      COMMENT '状态',
  PRIMARY KEY (id),
  UNIQUE KEY uk_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='每日任务定义表';

-- ------------------------------------------------------------
-- 12. 用户任务进度表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS t_user_task;
CREATE TABLE t_user_task (
  id          BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  user_id     BIGINT      NOT NULL                COMMENT '用户ID',
  task_date   DATE        NOT NULL                COMMENT '任务日期',
  task_code   VARCHAR(40) NOT NULL                COMMENT '任务编码',
  progress    INT         NOT NULL DEFAULT 0      COMMENT '当前进度',
  finished    TINYINT     NOT NULL DEFAULT 0      COMMENT '是否完成',
  claimed     TINYINT     NOT NULL DEFAULT 0      COMMENT '是否已领取奖励',
  create_time DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_date_code (user_id, task_date, task_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户任务进度表';

-- ------------------------------------------------------------
-- 13. 错题针对性解析缓存表
-- ------------------------------------------------------------
-- 为什么要缓存：讲解文案只取决于「题目 + 学生选的错项」，与具体学生无关，
-- 所以同一题同一错项只需生成一次。命中缓存时既不再调用大模型、也不消耗每日讲解配额。
-- 键设计成 (module, question_id, chosen) 而非带 user_id，
-- 正是因为文案本身不个性化 —— 带上 user_id 会让缓存完全失效。
DROP TABLE IF EXISTS t_wrong_explain;
CREATE TABLE t_wrong_explain (
  id          BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
  module      VARCHAR(20)   NOT NULL                COMMENT '所属模块：GRAMMAR / VOCAB / LISTENING',
  question_id BIGINT        NOT NULL                COMMENT '题目ID',
  chosen      VARCHAR(300)  NOT NULL                COMMENT '学生作答：选项题为 A/B/C/D，听力听写为整句',
  content     VARCHAR(1000) NOT NULL                COMMENT '针对该错项的讲解正文',
  source      VARCHAR(10)   NOT NULL                COMMENT '来源：LLM 真实调用 / MOCK 本地生成 / FALLBACK 失败降级',
  create_time DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '生成时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_module_question_chosen (module, question_id, chosen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='错题针对性解析缓存表';
