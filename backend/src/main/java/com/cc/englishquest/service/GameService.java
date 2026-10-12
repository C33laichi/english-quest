package com.cc.englishquest.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cc.englishquest.entity.User;
import com.cc.englishquest.mapper.UserMapper;
import com.cc.englishquest.vo.GameOverviewVO;
import com.cc.englishquest.vo.RankVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 游戏机制服务：积分总览、打卡、排行榜
 */
@Service
@RequiredArgsConstructor
public class GameService {

    private final UserMapper userMapper;
    private final PointService pointService;

    /** 游戏化数据总览 */
    public GameOverviewVO overview(Long userId) {
        User user = userMapper.selectById(userId);
        GameOverviewVO vo = new GameOverviewVO();
        int total = user.getTotalPoints() == null ? 0 : user.getTotalPoints();
        int[] levelInfo = pointService.levelInfo(total);
        vo.setTotalPoints(total);
        vo.setLevel(levelInfo[0]);
        vo.setLevelName(pointService.levelName(levelInfo[0]));
        // 区间长度制：cur = 本段内已得，need = 本段升级所需的总量（= 下一级门槛 - 本段起点）。
        // 这样前端只需 cur / need 即得进度，(need - cur) 即「还差多少」，两个数天然同分母，
        // 不会出现「分子大于分母」。满级时 need = -1，前端据此隐藏进度条。
        vo.setCurrentLevelPoints(total - levelInfo[1]);
        vo.setNextLevelPoints(levelInfo[2] < 0 ? -1 : levelInfo[2] - levelInfo[1]);
        vo.setStreakDays(user.getStreakDays() == null ? 0 : user.getStreakDays());
        vo.setTodayPoints(pointService.todayTotalPoints(userId));
        vo.setDailyLimit(pointService.getDailyLimit());
        vo.setCheckedToday(LocalDate.now().equals(user.getLastStudyDate()));
        vo.setRankNo(rankNo(userId));
        // 等级阶梯一并下发，首页的等级问号悬浮卡片直接用
        vo.setLevels(pointService.levels());
        return vo;
    }

    /** 打卡 */
    public int checkin(Long userId) {
        return pointService.checkin(userId);
    }

    /** 排行榜：type = points（积分榜） / streak（连续打卡榜） */
    public List<RankVO> rank(String type, Long currentUserId) {
        boolean byStreak = "streak".equalsIgnoreCase(type);
        List<User> users = userMapper.selectList(new LambdaQueryWrapper<User>()
                .eq(User::getStatus, 1)
                .orderByDesc(byStreak ? User::getStreakDays : User::getTotalPoints)
                .orderByAsc(User::getId)
                .last("LIMIT 50"));
        List<RankVO> result = new ArrayList<>();
        int rank = 1;
        for (User u : users) {
            RankVO vo = new RankVO();
            vo.setRank(rank++);
            vo.setUserId(u.getId());
            vo.setNickname(u.getNickname() == null ? u.getUsername() : u.getNickname());
            vo.setAvatar(u.getAvatar());
            vo.setValue(byStreak
                    ? (u.getStreakDays() == null ? 0 : u.getStreakDays())
                    : (u.getTotalPoints() == null ? 0 : u.getTotalPoints()));
            vo.setMine(u.getId().equals(currentUserId));
            result.add(vo);
        }
        return result;
    }

    /** 当前用户排名（按积分） */
    public int rankNo(Long userId) {
        User me = userMapper.selectById(userId);
        if (me == null) {
            return 0;
        }
        int myPoints = me.getTotalPoints() == null ? 0 : me.getTotalPoints();
        Long ahead = userMapper.selectCount(new LambdaQueryWrapper<User>()
                .eq(User::getStatus, 1)
                .gt(User::getTotalPoints, myPoints));
        return (ahead == null ? 0 : ahead.intValue()) + 1;
    }
}
