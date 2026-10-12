package com.cc.englishquest.vo;

import lombok.Data;

/**
 * 学习概览
 */
@Data
public class StatsOverviewVO {

    /** 累计学习天数 */
    private Integer studyDays;

    /** 累计答题数 */
    private Integer totalQuestions;

    /** 总正确率（%） */
    private Integer accuracy;

    /** 已通关卡数 */
    private Integer passedLessons;

    /** 累计积分 */
    private Integer totalPoints;

    /** 当前排名 */
    private Integer rankNo;

    /** 连续打卡天数 */
    private Integer streakDays;
}
