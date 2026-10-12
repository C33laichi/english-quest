package com.cc.englishquest.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cc.englishquest.entity.StudyRecord;
import com.cc.englishquest.entity.User;
import com.cc.englishquest.entity.UserLesson;
import com.cc.englishquest.mapper.StatsMapper;
import com.cc.englishquest.mapper.StudyRecordMapper;
import com.cc.englishquest.mapper.UserLessonMapper;
import com.cc.englishquest.mapper.UserMapper;
import com.cc.englishquest.vo.ChartVO;
import com.cc.englishquest.vo.StatsOverviewVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 学习数据看板服务
 */
@Service
@RequiredArgsConstructor
public class StatsService {

    private final StatsMapper statsMapper;
    private final StudyRecordMapper studyRecordMapper;
    private final UserLessonMapper userLessonMapper;
    private final UserMapper userMapper;
    private final GameService gameService;

    /** 学习概览 */
    public StatsOverviewVO overview(Long userId) {
        List<StudyRecord> records = studyRecordMapper.selectList(new LambdaQueryWrapper<StudyRecord>()
                .eq(StudyRecord::getUserId, userId));
        StatsOverviewVO vo = new StatsOverviewVO();
        vo.setTotalQuestions(records.size());
        int correct = records.stream().mapToInt(r -> r.getIsCorrect() == null ? 0 : r.getIsCorrect()).sum();
        vo.setAccuracy(records.isEmpty() ? 0 : (int) Math.round(correct * 100.0 / records.size()));
        vo.setStudyDays((int) records.stream()
                .map(r -> r.getCreateTime().toLocalDate())
                .distinct().count());
        vo.setPassedLessons(Math.toIntExact(userLessonMapper.selectCount(new LambdaQueryWrapper<UserLesson>()
                .eq(UserLesson::getUserId, userId)
                .in(UserLesson::getStatus, "PASSED", "MASTERED"))));
        User user = userMapper.selectById(userId);
        vo.setTotalPoints(user.getTotalPoints() == null ? 0 : user.getTotalPoints());
        vo.setStreakDays(user.getStreakDays() == null ? 0 : user.getStreakDays());
        vo.setRankNo(gameService.rankNo(userId));
        return vo;
    }

    /** 学习热力图（近 N 天） */
    public List<ChartVO.HeatmapItem> heatmap(Long userId, int days) {
        LocalDateTime start = LocalDate.now().minusDays(days - 1L).atStartOfDay();
        List<ChartVO.HeatmapItem> result = new ArrayList<>();
        Map<String, Integer> countMap = new java.util.HashMap<>();
        for (Map<String, Object> row : statsMapper.heatmap(userId, start)) {
            countMap.put(String.valueOf(row.get("day")), toInt(row.get("cnt")));
        }
        for (int i = days - 1; i >= 0; i--) {
            String day = LocalDate.now().minusDays(i).toString();
            result.add(new ChartVO.HeatmapItem(day, countMap.getOrDefault(day, 0)));
        }
        return result;
    }

    /** 正确率趋势（近 N 天） */
    public List<ChartVO.TrendItem> accuracyTrend(Long userId, int days) {
        LocalDateTime start = LocalDate.now().minusDays(days - 1L).atStartOfDay();
        List<ChartVO.TrendItem> result = new ArrayList<>();
        Map<String, ChartVO.TrendItem> map = new java.util.HashMap<>();
        for (Map<String, Object> row : statsMapper.trend(userId, start)) {
            String day = String.valueOf(row.get("day"));
            int total = toInt(row.get("total"));
            int correct = toInt(row.get("correct"));
            map.put(day, new ChartVO.TrendItem(day, total, correct,
                    total == 0 ? 0 : (int) Math.round(correct * 100.0 / total)));
        }
        for (int i = days - 1; i >= 0; i--) {
            String day = LocalDate.now().minusDays(i).toString();
            result.add(map.getOrDefault(day, new ChartVO.TrendItem(day, 0, 0, 0)));
        }
        return result;
    }

    /** 知识点掌握度雷达图 */
    public List<ChartVO.RadarItem> radar(Long userId) {
        List<ChartVO.RadarItem> result = new ArrayList<>();
        for (Map<String, Object> row : statsMapper.grammarRadar(userId)) {
            String name = String.valueOf(row.get("name"));
            result.add(new ChartVO.RadarItem(shortName(name), accuracy(row)));
        }
        for (Map<String, Object> row : statsMapper.vocabRadar(userId)) {
            result.add(new ChartVO.RadarItem(String.valueOf(row.get("name")), accuracy(row)));
        }
        return result;
    }

    private int accuracy(Map<String, Object> row) {
        int total = toInt(row.get("total"));
        int correct = toInt(row.get("correct"));
        return total == 0 ? 0 : (int) Math.round(correct * 100.0 / total);
    }

    /** 阶段名称过长时截断，便于雷达图展示 */
    private String shortName(String name) {
        if (name == null) {
            return "未分类";
        }
        String cleaned = name.replace("七天掌握", "").replace("阶段", "");
        return cleaned.length() > 8 ? cleaned.substring(0, 8) : cleaned;
    }

    private int toInt(Object o) {
        if (o == null) {
            return 0;
        }
        if (o instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(o));
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
