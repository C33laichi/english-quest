-- ============================================================
-- 补发历史打卡奖励差额（旧逻辑 Math.min(streak,10) -> 固定 5 分）
--
-- 背景：checkin 原先按连续天数发分（第 1 天 1 分、第 2 天 2 分……），
--       与首页「打卡 +5 积分」文案矛盾。代码已改为固定 checkinPoint=5，
--       但历史流水仍是旧分值，账号总积分因此少算。
--
-- 做法：**不改写历史流水**，为每个受影响账号单独补一条 CHECKIN 补偿流水，
--       并同步 total_points，保持「总积分 == SUM(change_points)」这条对账口径。
--       biz_id 固定为 checkin-fix-20261109，配合唯一索引 uk_user_type_biz 防重复补发。
--
-- 幂等：重复执行不会二次补发（已补过的账号会被 DELETE 出临时表）。
-- ============================================================

-- 1. 快照：每个账号旧打卡的分次与差额
DROP TEMPORARY TABLE IF EXISTS tmp_fix;
CREATE TEMPORARY TABLE tmp_fix (
  user_id BIGINT NOT NULL PRIMARY KEY,
  old_cnt INT NOT NULL,
  got     INT NOT NULL,
  deficit INT NOT NULL
);

INSERT INTO tmp_fix (user_id, old_cnt, got, deficit)
SELECT user_id,
       COUNT(*),
       SUM(change_points),
       SUM(GREATEST(5 - change_points, 0))
FROM t_point_log
WHERE type = 'CHECKIN' AND change_points < 5
GROUP BY user_id
HAVING SUM(GREATEST(5 - change_points, 0)) > 0;

-- 2. 剔除已经补过的账号（幂等）
DELETE f FROM tmp_fix f
WHERE EXISTS (
  SELECT 1 FROM t_point_log l
  WHERE l.user_id = f.user_id AND l.type = 'CHECKIN' AND l.biz_id = 'checkin-fix-20261109'
);

SELECT '=== 本次要补的账号 ===' AS step;
SELECT f.user_id, u.username, u.total_points AS before_total,
       f.old_cnt, f.got, f.deficit
FROM tmp_fix f JOIN t_user u ON u.id = f.user_id
ORDER BY f.user_id;

-- 3. 事务内：先补总分，再写补偿流水
START TRANSACTION;

UPDATE t_user u
JOIN tmp_fix f ON f.user_id = u.id
SET u.total_points = u.total_points + f.deficit;

INSERT INTO t_point_log (user_id, change_points, type, biz_id, remark)
SELECT f.user_id,
       f.deficit,
       'CHECKIN',
       'checkin-fix-20261109',
       CONCAT('补发历史打卡奖励差额：修正前按连续天数发分，', f.old_cnt,
              ' 次打卡共少发 ', f.deficit, ' 分（每次应为 5 分）')
FROM tmp_fix f;

COMMIT;

SELECT '=== 补发后 ===' AS step;
SELECT l.user_id, u.username, l.change_points AS fix_points, u.total_points AS after_total,
       (SELECT COALESCE(SUM(change_points),0) FROM t_point_log x WHERE x.user_id=u.id) AS log_sum,
       l.remark
FROM t_point_log l JOIN t_user u ON u.id = l.user_id
WHERE l.type='CHECKIN' AND l.biz_id='checkin-fix-20261109'
ORDER BY l.user_id;
