package com.cc.englishquest.service;

import cn.hutool.core.date.DateUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cc.englishquest.common.PointType;
import com.cc.englishquest.entity.PointLog;
import com.cc.englishquest.entity.User;
import com.cc.englishquest.mapper.PointLogMapper;
import com.cc.englishquest.mapper.UserMapper;
import com.cc.englishquest.vo.LevelStepVO;
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
     * @return 打卡后连续天数
     */
    @Transactional(rollbackFor = Exception.class)
    public int checkin(Long userId) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            return 0;
        }
        LocalDate today = LocalDate.now();
        LocalDate last = user.getLastStudyDate();
        int streak = user.getStreakDays() == null ? 0 : user.getStreakDays();

        if (last == null || last.isBefore(today.minusDays(1))) {
            streak = 1;
        } else if (last.isEqual(today.minusDays(1))) {
            streak = streak + 1;
        } else if (last.isEqual(today)) {
            // 今日已打卡，不重复累加
            return streak == 0 ? 1 : streak;
        }
        user.setStreakDays(streak);
        user.setLastStudyDate(today);
        userMapper.updateById(user);

        // 连续打卡奖励：+N（上限 +10），每天只发一次
        int reward = Math.min(streak, 10);
        String bizId = "checkin-" + today;
        if (!exists(userId, PointType.CHECKIN, bizId)) {
            addPoints(userId, reward, PointType.CHECKIN, bizId, "连续打卡第" + streak + "天");
        }
        return streak;
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

    public int getDailyLimit() {
        return dailyLimit;
    }

    /** 今日日期字符串（yyyy-MM-dd） */
    public String today() {
        return DateUtil.format(new Date(), "yyyy-MM-dd");
    }
}
