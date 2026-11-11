package com.cc.englishquest.vo;

import lombok.Data;

/**
 * 学习概览
 */
@Data
public class StatsOverviewVO {

    /** 累计学习天数 */
    private Integer studyDays;

    /** 累计答题数（练习次数，同一题重复练会重复计） */
    private Integer totalQuestions;

    /** 覆盖题数（去重后的题目数，与正确率分母一致） */
    private Integer coveredQuestions;

    /** 正确率（%），按每道题最近一次结果计算 */
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
