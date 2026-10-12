-- ============================================================
-- 每日任务配置 + 演示数据
-- ============================================================
USE english_quest;

DELETE FROM t_daily_task;
INSERT INTO t_daily_task (id, code, title, task_type, target_value, reward_points, sort_no, status) VALUES
(1, 'DAILY_LEVEL',   '完成 1 个关卡',      'LEVEL_COUNT',   1,  10, 1, 1),
(2, 'DAILY_CORRECT', '累计答对 10 道题',   'CORRECT_COUNT', 10, 15, 2, 1),
(3, 'DAILY_AI',      '使用 AI 智能练习 1 次', 'AI_COUNT',    1,  10, 3, 1);

-- 账号（admin / student）由后端启动时自动创建（BCrypt 加密）
