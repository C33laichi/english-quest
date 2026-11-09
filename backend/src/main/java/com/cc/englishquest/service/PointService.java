package com.cc.englishquest.service;

import cn.hutool.core.date.DateUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cc.englishquest.common.PointType;
import com.cc.englishquest.entity.PointLog;
import com.cc.englishquest.entity.User;
import com.cc.englishquest.mapper.PointLogMapper;
import com.cc.englishquest.mapper.UserMapper;
import com.cc.englishquest.vo.CheckinVO;
import com.cc.englishquest.vo.LevelStepVO;
import com.cc.englishquest.vo.PointLogVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

/**
 * 积分引擎：负责积分发放、每日上限控制、等级换算、连续打卡
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PointService {

    private final PointLogMapper pointLogMapper;
    private final UserMapper userMapper;

    @Value("${app.point.daily-limit:200}")
    private int dailyLimit;

    @Value("${app.point.answer-point:2}")
    private int answerPoint;

    @Value("${app.point.level-point:10}")
    private int levelPoint;

    @Value("${app.point.full-score-point:20}")
    private int fullScorePoint;

    @Value("${app.point.login-point:5}")
    private int loginPoint;

    /**
     * 每日打卡固定奖励。
     *
     * <p>固定值，**不再随连续天数递增**。首页规则卡片写的是「打卡 +5 积分」，
     * 若按连打天数发（第 1 天 1 分、第 2 天 2 分……），学生打卡后总积分只涨 1 分，
     * 与文案直接矛盾。连续天数只作为鼓励性展示，不参与积分计算。</p>
     */
    @Value("${app.point.checkin-point:5}")
    private int checkinPoint;

    @Value("${app.point.answer-daily-limit:100}")
    private int answerDailyLimit;

    /** 等级门槛（累计积分）与称号 */
    private static final int[] LEVEL_THRESHOLD = {0, 100, 300, 600, 1000, 2000};
    private static final String[] LEVEL_NAME = {"英语学徒", "单词猎人", "语法游侠", "闯关达人", "学霸精英", "专升本王者"};

    /**
     * 发放积分（幂等 + 每日上限）
     *
     * @param type  {@link PointType}
     * @param bizId 业务唯一标识，重复发放会被唯一索引拦截
     * @return 实际到账积分
     */
    @Transactional(rollbackFor = Exception.class)
    public int addPoints(Long userId, int points, String type, String bizId, String remark) {
        if (points <= 0) {
            return 0;
        }

        // 1. 每日总上限控制
        int todayTotal = todayTotalPoints(userId);
        if (todayTotal >= dailyLimit) {
            log.debug("用户 {} 今日积分已达上限 {}", userId, dailyLimit);
            return 0;
        }
        // 2. 答题类积分另有上限
        if (PointType.ANSWER.equals(type)) {
            int answerToday = todayPointsByType(userId, PointType.ANSWER);
            if (answerToday >= answerDailyLimit) {
                return 0;
            }
            points = Math.min(points, answerDailyLimit - answerToday);
        }
        points = Math.min(points, dailyLimit - todayTotal);
        if (points <= 0) {
            return 0;
        }

        // 3. 写入流水（唯一索引保证幂等）
        PointLog logEntity = new PointLog();
        logEntity.setUserId(userId);
        logEntity.setChangePoints(points);
        logEntity.setType(type);
        logEntity.setBizId(bizId);
        logEntity.setRemark(remark);
        logEntity.setCreateTime(LocalDateTime.now());
        try {
            pointLogMapper.insert(logEntity);
        } catch (DuplicateKeyException e) {
            log.debug("积分重复发放已忽略: user={}, type={}, bizId={}", userId, type, bizId);
            return 0;
        }

        // 4. 累加到用户总积分
        User user = userMapper.selectById(userId);
        if (user != null) {
            user.setTotalPoints((user.getTotalPoints() == null ? 0 : user.getTotalPoints()) + points);
            userMapper.updateById(user);
        }
        return points;
    }

    /** 今日已获得积分 */
    public int todayTotalPoints(Long userId) {
        List<PointLog> logs = pointLogMapper.selectList(new LambdaQueryWrapper<PointLog>()
                .eq(PointLog::getUserId, userId)
                .ge(PointLog::getCreateTime, LocalDate.now().atStartOfDay()));
        return logs.stream().mapToInt(PointLog::getChangePoints).sum();
    }

    /** 今日某类型积分 */
    public int todayPointsByType(Long userId, String type) {
        List<PointLog> logs = pointLogMapper.selectList(new LambdaQueryWrapper<PointLog>()
                .eq(PointLog::getUserId, userId)
                .eq(PointLog::getType, type)
                .ge(PointLog::getCreateTime, LocalDate.now().atStartOfDay()));
        return logs.stream().mapToInt(PointLog::getChangePoints).sum();
    }

    /** 是否存在某条积分记录（用于判断每日首登等） */
    public boolean exists(Long userId, String type, String bizId) {
        return pointLogMapper.selectCount(new LambdaQueryWrapper<PointLog>()
                .eq(PointLog::getUserId, userId)
                .eq(PointLog::getType, type)
                .eq(PointLog::getBizId, bizId)) > 0;
    }

    /**
     * 积分明细（按时间倒序）。
     *
     * <p>之前系统只有「总积分」一个数字，学生看到总分和心里的预期不一致时，
     * 没有任何地方能查到「哪一笔加了分、哪一笔没加」——
     * 这就是「总分与明细对不上」最直接的成因：不是账错了，是无账可查。</p>
     *
     * @param limit 条数上限，夹在 1~200 之间，避免一次拖出整张流水表
     */
    public List<PointLogVO> logs(Long userId, int limit) {
        int size = Math.min(Math.max(limit, 1), 200);
        List<PointLog> rows = pointLogMapper.selectList(new LambdaQueryWrapper<PointLog>()
                .eq(PointLog::getUserId, userId)
                .orderByDesc(PointLog::getId)
                .last("LIMIT " + size));
        List<PointLogVO> result = new ArrayList<>(rows.size());
        for (PointLog row : rows) {
            PointLogVO vo = new PointLogVO();
            vo.setId(row.getId());
            vo.setType(row.getType());
            vo.setTypeName(PointType.label(row.getType()));
            vo.setChangePoints(row.getChangePoints());
            vo.setRemark(row.getRemark());
            vo.setCreateTime(row.getCreateTime());
            result.add(vo);
        }
        return result;
    }

    /** 某用户的流水合计（对账用） */
    public int sumLogs(Long userId) {
        List<PointLog> rows = pointLogMapper.selectList(new LambdaQueryWrapper<PointLog>()
                .eq(PointLog::getUserId, userId));
        int sum = 0;
        for (PointLog row : rows) {
            sum += row.getChangePoints() == null ? 0 : row.getChangePoints();
        }
        return sum;
    }

    /**
     * 以流水为准重算总积分 —— 对账兜底。
     *
     * <p>`t_user.total_points` 是流水的一个**缓存**，正常情况下两者必然相等
     * （所有加分都走 {@link #addPoints}，同一事务里写流水 + 累加）。
     * 但历史数据迁移、手工改库、并发丢更新等都可能让缓存漂移，
     * 而一旦漂移，没有任何入口能把它拉回来。这个方法就是那个入口：
     * 以 `SUM(point_log.change_points)` 覆盖总积分，幂等，可以随时点。</p>
     *
     * @return 重算后的总积分
     */
    @Transactional(rollbackFor = Exception.class)
    public int recalcTotalPoints(Long userId) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            return 0;
        }
        int sum = sumLogs(userId);
        int before = user.getTotalPoints() == null ? 0 : user.getTotalPoints();
        user.setTotalPoints(sum);
        userMapper.updateById(user);
        log.info("按流水重算积分：user={}，{} -> {}", userId, before, sum);
        return sum;
    }

    /** 等级换算：[等级, 当前等级起始积分, 下一等级所需积分] */
    public int[] levelInfo(int totalPoints) {
        int level = 1;
        for (int i = LEVEL_THRESHOLD.length - 1; i >= 0; i--) {
            if (totalPoints >= LEVEL_THRESHOLD[i]) {
                level = i + 1;
                break;
            }
        }
        int currentBase = LEVEL_THRESHOLD[level - 1];
        int nextNeed = level < LEVEL_THRESHOLD.length ? LEVEL_THRESHOLD[level] : -1;
        return new int[]{level, currentBase, nextNeed};
    }

    public String levelName(int level) {
        int idx = Math.min(Math.max(level - 1, 0), LEVEL_NAME.length - 1);
        return LEVEL_NAME[idx];
    }

    /**
     * 完整等级阶梯，供首页「等级说明」悬浮卡片展示。
     *
     * <p>直接由 {@link #LEVEL_THRESHOLD} / {@link #LEVEL_NAME} 派生，
     * 所以调整门槛和称号时前端自动跟着变，不存在第二份需要同步的配置。</p>
     */
    public List<LevelStepVO> levels() {
        List<LevelStepVO> list = new ArrayList<>(LEVEL_THRESHOLD.length);
        for (int i = 0; i < LEVEL_THRESHOLD.length; i++) {
            list.add(new LevelStepVO(i + 1, LEVEL_NAME[i], LEVEL_THRESHOLD[i]));
        }
        return list;
    }

    /**
     * 打卡：更新连续天数与最近学习日期
     *
     * @return 打卡后的连续天数 + 本次实发积分（见 {@link CheckinVO}）
     */
    @Transactional(rollbackFor = Exception.class)
    public CheckinVO checkin(Long userId) {
        CheckinVO result = new CheckinVO();
        User user = userMapper.selectById(userId);
        if (user == null) {
            return result;
        }
        LocalDate today = LocalDate.now();
        LocalDate last = user.getLastStudyDate();
        int streak = user.getStreakDays() == null ? 0 : user.getStreakDays();

        if (last != null && last.isEqual(today)) {
            // 今日已打卡：天数与积分都不再变动，但要把当前状态回给前端，
            // 免得按钮点下去什么都不发生（旧版这里直接 return，前端拿不到任何数字）
            result.setStreakDays(streak == 0 ? 1 : streak);
            result.setGainPoints(0);
            result.setTotalPoints(user.getTotalPoints() == null ? 0 : user.getTotalPoints());
            return result;
        }
        if (last == null || last.isBefore(today.minusDays(1))) {
            streak = 1;
        } else {
            streak = streak + 1;
        }
        user.setStreakDays(streak);
        user.setLastStudyDate(today);
        userMapper.updateById(user);

        // 打卡奖励为固定值，不随连续天数变化（见 checkinPoint 字段注释）
        String bizId = "checkin-" + today;
        int gain = 0;
        if (!exists(userId, PointType.CHECKIN, bizId)) {
            gain = addPoints(userId, checkinPoint, PointType.CHECKIN, bizId, "每日打卡，连续第" + streak + "天");
        }

        User latest = userMapper.selectById(userId);
        result.setStreakDays(streak);
        result.setGainPoints(gain);
        result.setTotalPoints(latest == null || latest.getTotalPoints() == null ? 0 : latest.getTotalPoints());
        return result;
    }

    public int getAnswerPoint() {
        return answerPoint;
    }

    public int getLevelPoint() {
        return levelPoint;
    }

    public int getFullScorePoint() {
        return fullScorePoint;
    }

    public int getLoginPoint() {
        return loginPoint;
    }

    public int getCheckinPoint() {
        return checkinPoint;
    }

    public int getDailyLimit() {
        return dailyLimit;
    }

    /** 今日日期字符串（yyyy-MM-dd） */
    public String today() {
        return DateUtil.format(new Date(), "yyyy-MM-dd");
    }
}
