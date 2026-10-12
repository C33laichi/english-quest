-- ============================================================
-- 增量脚本：错题针对性解析缓存表
--
-- 用途：**已存在的库**只需要跑这一个文件即可，不必重跑 01_schema.sql
--       （01_schema.sql 会 DROP 重建全部表，会清掉用户与答题数据）。
--       新建库则跑 01 → 02 → 03 → 04 → 05 即可，01 里已含本表结构。
-- 可重复执行：用了 IF NOT EXISTS。
--
-- ⚠ 本文件与 01_schema.sql 第 13 节是同一张表的两个入口，改动时**两处都要同步**。
-- ============================================================
USE english_quest;

CREATE TABLE IF NOT EXISTS t_wrong_explain (
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
