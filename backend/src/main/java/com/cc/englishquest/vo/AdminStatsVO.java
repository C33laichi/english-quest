package com.cc.englishquest.vo;

import lombok.Data;

/**
 * 后台全局统计
 */
@Data
public class AdminStatsVO {

    private Long userCount;

    private Long activeToday;

    private Long questionCount;

    private Long answerCount;

    private Long aiCallCount;

    private Long vocabLevelCount;

    private Long grammarLessonCount;

    private Long todayAnswerCount;
}
